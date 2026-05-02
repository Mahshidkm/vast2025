import networkx as nx
import pandas as pd
import json
import os
from typing import Any, Dict, Optional, Tuple

data_file_path = 'data/MC1_graph.json' 
person_work_types = ['PerformerOf', 'ComposerOf', 'ProducerOf', 'LyricistOf']
influence_work_types = ['InStyleOf', 'InterpolatesFrom', 'CoverOf','LyricalReferenceTo', 'DirectlySamples']
member_type = 'MemberOf'

def read_data_from_json_to_graph(json_file: str) -> nx.MultiDiGraph:
    """Load a graph from a JSON file in node-link format."""
    try:
        with open(json_file, 'r') as file:
            data = json.load(file) # data is a dict 
    
        print("Type of data:", type(data))
    
    except FileNotFoundError:
        print("Error: The file 'data.json' was not found.")
    except json.JSONDecodeError:
        print("Error: Failed to decode JSON from the file.")
    G = nx.node_link_graph(data, directed=True, multigraph=True)
    return G
    
def find_sailor_shift(G: nx.MultiDiGraph) -> Optional[Tuple[Any, Dict]]:
    """
    Return (node_id, attr_dict) for the first node whose name matches
    "Sailor Shift" (case-insensitive, trimmed). Returns None if not found.
    """
    target = 'sailor shift'
    for n, a in G.nodes(data=True):
        name = a.get('name')
        if name.strip().lower() == target:
            return n, a
    return None

def get_neighbors_by_edge_type(G: nx.MultiDiGraph, node: Any, edge_type: str, direction: str= 'out') -> list:
    """Return all neighbors of `node` connected by an edge of type `edge_type` in the given direction."""
    neighbors = []
    
    if direction == 'out':
        for u, v, data in G.out_edges(node, data=True):
            et = data.get('Edge Type')
            if et == edge_type:
                neighbors.append(v)
    else:  ## 'in'
        for u, v, data in G.in_edges(node, data=True):
            et = data.get('Edge Type')
            if et == edge_type:
                neighbors.append(u)
    return neighbors
    
def find_role_of_person(G, person_node):
    roles = set()
    for _, _, data in G.out_edges(person_node, data=True):
        edge_type = data.get('Edge Type')
        if edge_type in person_work_types:
            roles.add(edge_type)
    return roles 

def add_influence(artist, etype, ctype, source_work, inf_work, date, score, node_type, artist_work_genre, target_dict):
    """Helper to store an influence record."""
    # print("yes")
    if artist not in target_dict:
        target_dict[artist] = set()
    target_dict[artist].add((etype, ctype, source_work, inf_work, date, score, node_type, artist_work_genre))
    
def find_all_artist_works(G: nx.MultiDiGraph, artist_node):
    artist_works = {} # artist_work -> a set of artist roles for that specific work.
    band_name_and_members = {}  # band -> set of members in the band
    
    # --- Step 1: Collect all works directly from artist ---
    for etype in person_work_types:
        for neighbor in get_neighbors_by_edge_type(G, artist_node, etype, 'out'):
            node_type = G.nodes[neighbor].get('Node Type')
            # Only Songs and Albums are considered "works" for influence traversal
            if node_type in ('Song', 'Album'):
                if neighbor not in artist_works:
                    artist_works[neighbor] = set()
                artist_works[neighbor].add(etype)
                
     # --- Step 2: Collect all works indirectly from artist. Works that artist has been a member in it.           
    for band in get_neighbors_by_edge_type(G, artist_node, member_type, 'out'):
        band_name = G.nodes[band].get('name')
        for member in get_neighbors_by_edge_type(G, band, member_type, 'in'):
            if member != artist_node:
                if band not in band_name_and_members:
                    band_name_and_members[band] = set()
                band_name_and_members[band].add(member)
        for etype in person_work_types:
            for work in get_neighbors_by_edge_type(G, band,etype, 'out'):
                if work not in artist_works:
                    artist_works[work] = set()
                artist_works[work].add(etype)
    return artist_works, band_name_and_members

def find_collaborators_of_artist(G: nx.MultiDiGraph, artist_node: Any) -> Dict[Any, set[Tuple[Any, Any, str]]]:
    """ find all people who directly worked with the artist in her/hist works
    return {collaborator : {(artist_work, artist_work_release_date, ctype, artist_work_genre), (...),...}}
    """
    collaborators = {}
    artist_works, _ = find_all_artist_works(G , artist_node)
    for ctype in person_work_types:
        for artist_work in artist_works:
            artist_work_name = G.nodes[artist_work].get('name')
            artist_work_release_date = G.nodes[artist_work].get('release_date')
            genre =  G.nodes[artist_work].get('genre')
            for creator in get_neighbors_by_edge_type(G , artist_work, ctype, 'in'):
                if creator != artist_node:
                    node_type = G.nodes[creator].get('Node Type')
                    if node_type == 'Person':
                        # creator_name = G.nodes[creator].get('name')
                        if creator not in collaborators:
                            collaborators[creator] = set()
                        collaborators[creator].add((artist_work_name, artist_work_release_date, ctype, genre))
                    elif node_type == 'MusicalGroup': ## if it is a group, the name of members should be collected.
                        for member in get_neighbors_by_edge_type(G, creator, member_type, 'in'):
                            if member != artist_node:
                                # member_name = G.nodes[member].get('name')
                                if member not in collaborators:
                                    collaborators[member] = set()
                                collaborators[member].add((artist_work_name, artist_work_release_date, ctype, genre))
    return collaborators

def find_directly_influenced(G: nx.MultiDiGraph, artist_node: Any) -> Dict[Any, set[Tuple[str, str, Any, Any, Any, Any]]]:
    """ 
    Find artists who was directly inspired by the artist_node works
    eg output: {artist_influenced_node: {(InStyleOf, ProducerOf, artist_work, artist_influenced_work, artist_work_release_date, influence_score )}}
    """
    artists_influenced_directly = {}
    ## 1. Through artist_nodes's works
    artist_works, bands = find_all_artist_works(G, artist_node)
    for etype in influence_work_types:
        for artist_work in artist_works:
            artist_roles = artist_works[artist_work]
            artist_work_release_date = G.nodes[artist_work].get('release_date')
            artist_work_genre = G.nodes[artist_work].get('genre')
            for neighbor in get_neighbors_by_edge_type(G, artist_work, etype, 'in'):
                neighbor_work_release_date = G.nodes[neighbor].get('release_date')
                if neighbor != artist_work:
                    if neighbor_work_release_date is not None and int(neighbor_work_release_date) >= int(artist_work_release_date):
                        for ctype in person_work_types:
                            for creator in get_neighbors_by_edge_type(G, neighbor, ctype, 'in'):
                                if creator != artist_node:
                                    node_type = G.nodes[creator].get('Node Type')
                                    score = 1 if ctype in artist_roles else 1/2
                                    if node_type == 'Person':
                                        if etype == 'InterpolatesFrom':
                                            if ctype == 'ComposerOf':
                                                    add_influence(creator, etype, ctype, artist_work, neighbor,neighbor_work_release_date, score, node_type, artist_work_genre,  artists_influenced_directly)    
                                        else: #if etype=InStyleOf, CoverOf,....
                                            # print('yes')
                                            add_influence(creator, etype, ctype, artist_work, neighbor,neighbor_work_release_date, score, node_type, artist_work_genre,  artists_influenced_directly)
                                
                                    elif node_type == 'MusicalGroup':
                                            for member in get_neighbors_by_edge_type(G, creator, member_type, 'in'):
                                                if member != artist_node:
                                                    add_influence(member, etype, ctype, artist_work, neighbor,neighbor_work_release_date, score, node_type, artist_work_genre, artists_influenced_directly)
                
                                            
    # 2. Through artist_node as a person
      #2.1 Find all artist roles
    artist_roles = find_role_of_person(G, artist_node)
    if bands:
        artist_roles.add('PerformerOf')
    # print(f"artist_roles:{artist_roles}")
      #2.2 Find all people who are inspired by artist_node herself directly
    for etype in influence_work_types:
        for neighbor in get_neighbors_by_edge_type(G, artist_node, etype, 'in'):
            neighbor_work_release_date = G.nodes[neighbor].get('release_date')
            for ctype in person_work_types:
                for creator in get_neighbors_by_edge_type(G, neighbor, ctype, 'in'):
                    node_type = G.nodes[creator].get('Node Type')
                    score = 1 if ctype in artist_roles else 1/2
                    if node_type == 'Person':
                        if creator != artist_node:
                            add_influence(creator, etype, ctype, 'N/A', neighbor,neighbor_work_release_date, score, node_type, artists_influenced_directly)
                    elif node_type == 'MusicalGroup':
                        for member in get_neighbors_by_edge_type(G, creator, member_type, 'in'):
                            if member != artist_node:
                                add_influence(member, etype, ctype, 'N/A', neighbor,neighbor_work_release_date, score, node_type, artists_influenced_directly)
    return artists_influenced_directly  




