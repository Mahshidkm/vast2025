#!/usr/bin/env python
# coding: utf-8

# In[29]:


from helper import *
    
# ---Step1: People who collaborated in Sailor works.
def find_collaborators_of_sailor(G: nx.MultiDiGraph, sailor_node: Any) -> Dict[Any, set[Tuple[Any, Any, str]]]:
    """ find all people who directly worked with Sailor in her works """
    collaborators = {}
    sailor_works, _ = find_all_artist_works(G , sailor_node)
    for ctype in person_work_types:
        for sailor_work in sailor_works:
            sailor_work_release_date = G.nodes[sailor_work].get('release_date')
            for creator in get_neighbors_by_edge_type(G , sailor_work, ctype, 'in'):
                if creator != sailor_node:
                    node_type = G.nodes[creator].get('Node Type')
                    if node_type == 'Person':
                        # creator_name = G.nodes[creator].get('name')
                        if creator not in collaborators:
                            collaborators[creator] = set()
                        collaborators[creator].add((sailor_work, sailor_work_release_date, ctype))
                    elif node_type == 'MusicalGroup': ## if it is a group, the name of members should be collected.
                        for member in get_neighbors_by_edge_type(G, creator, member_type, 'in'):
                            if member != sailor_node:
                                # member_name = G.nodes[member].get('name')
                                if member not in collaborators:
                                    collaborators[member] = set()
                                collaborators[member].add((sailor_work, sailor_work_release_date, ctype))
    return collaborators

def add_influence(artist, etype, ctype, source_work, inf_work, date, score, node_type, target_dict):
    """Helper to store an influence record."""
    # print("yes")
    if artist not in target_dict:
        target_dict[artist] = set()
    target_dict[artist].add((etype, ctype, source_work, inf_work, date, score, node_type))

def find_directly_influenced(G: nx.MultiDiGraph, sailor_node: Any) -> Dict[Any, set[Tuple[str, str, Any, Any, Any, Any]]]:
    """ 
    Find artists who was directly inspired by Sailor works
    eg output: {artist_node: {(InStyleOf, ProducerOf, sailor_work, artist_work, artist_work_release_date, influence_score )}}
    """
    artists_influenced_directly = {}
    ## 1. Through Sailor's works
    sailor_works, bands = find_all_artist_works(G, sailor_node)
    # print(sailor_works)
    for etype in influence_work_types:
        for sailor_work in sailor_works:
            # print(sailor_work)
            sailor_roles = sailor_works[sailor_work]
            # print(sailor_roles)
            sailor_work_release_date = G.nodes[sailor_work].get('release_date')
            for neighbor in get_neighbors_by_edge_type(G, sailor_work, etype, 'in'):
                neighbor_work_release_date = G.nodes[neighbor].get('release_date')
                if neighbor != sailor_work:
                    if int(neighbor_work_release_date) > int(sailor_work_release_date):
                        for ctype in person_work_types:
                            for creator in get_neighbors_by_edge_type(G, neighbor, ctype, 'in'):
                                if creator != sailor_node:
                                    node_type = G.nodes[creator].get('Node Type')
                                    score = 1 if ctype in sailor_roles else 1/2
                                    if node_type == 'Person':
                                        if etype == 'InterpolatesFrom':
                                            if ctype == 'ComposerOf':
                                                    add_influence(creator, etype, ctype, sailor_work, neighbor,neighbor_work_release_date, score, node_type, artists_influenced_directly)    
                                        else: #if etype=InStyleOf, CoverOf,....
                                            # print('yes')
                                            add_influence(creator, etype, ctype, sailor_work, neighbor,neighbor_work_release_date, score, node_type, artists_influenced_directly)
                                
                                    elif node_type == 'MusicalGroup':
                                            for member in get_neighbors_by_edge_type(G, creator, member_type, 'in'):
                                                if member != sailor_node:
                                                    add_influence(member, etype, ctype, sailor_work, neighbor,neighbor_work_release_date, score, node_type, artists_influenced_directly)
                
                                            
    # 2. Through Sailor as a person
      #2.1 Find all Sailor roles
    sailor_roles = find_role_of_person(G, sailor_node)
    if bands:
        sailor_roles.add('PerformerOf')
    print(f"sailor_roles:{sailor_roles}")
      #2.2 Find all people who are inspired by Sailor herself directly
    for etype in influence_work_types:
        for neighbor in get_neighbors_by_edge_type(G, sailor_node, etype, 'in'):
            neighbor_work_release_date = G.nodes[neighbor].get('release_date')
            for ctype in person_work_types:
                for creator in get_neighbors_by_edge_type(G, neighbor, ctype, 'in'):
                    node_type = G.nodes[creator].get('Node Type')
                    score = 1 if ctype in sailor_roles else 1/2
                    if node_type == 'Person':
                        if creator != sailor_node:
                            add_influence(creator, etype, ctype, 'N/A', neighbor,neighbor_work_release_date, score, node_type, artists_influenced_directly)
                    elif node_type == 'MusicalGroup':
                        for member in get_neighbors_by_edge_type(G, creator, member_type, 'in'):
                            if member != sailor_node:
                                add_influence(member, etype, ctype, 'N/A', neighbor,neighbor_work_release_date, score, node_type, artists_influenced_directly)
    return artists_influenced_directly                

def find_indirectly_influenced(G, sailor_node, directly_influenced_dict):
    """
    Finds artists influenced indirectly via chains of influence edges.
    directly_influenced_dict: output from find_directly_influenced (keys are directly influenced artists)
    Returns a dict in the same format: {artist_node: {(etype, ctype, source_work, inf_work, date, score)}}
    """
    artists_influenced_indirectly = {}
    visited = set(directly_influenced_dict.keys()) | {sailor_node}
    # print(visited)
    # queue holds (artist, hop) – hop is the current level (starting at 2 for first indirect step)
    queue = list(directly_influenced_dict.keys())
    # print(queue)

    influence_types = ['InStyleOf', 'InterpolatesFrom', 'CoverOf', 'LyricalReferenceTo', 'DirectlySamples']
    person_roles = ['PerformerOf', 'ComposerOf', 'ProducerOf', 'LyricistOf']
    sum_of_influenced_score = 0 ## how much artist was influenced directly by Sailor e.g (1 + 0.5)=1.5
    while queue:
        artist = queue.pop(0)
        print(f"artist:{artist}")
        # Get all works by this artist (including band works)
        artist_works, bands = find_all_artist_works(G, artist)
        print(f"artist_works:{artist_works}\n\n")
        artist_roles = find_role_of_person(G, artist)
        if bands:
            artist_roles.add('PerformerOf')
        print(f"artist_roles:{artist_roles}\n\n")
        for item in directly_influenced_dict[artist]:
            sum_of_influenced_score += item[5]
            
        for work in artist_works:
            work_date = G.nodes[work].get('release_date')
            for etype in influence_types:
                # incoming edges to 'work' = works influenced by it
                tests = get_neighbors_by_edge_type(G, work, etype, 'in')
                if len(tests) == 0:
                    print('ooooooooooooooooooooooooooooooooooooo')
                else:
                    print("hellllllllo")
                for inf_work in get_neighbors_by_edge_type(G, work, etype, 'in'):
                    inf_work_date = G.nodes[inf_work].get('release_date')
                    if inf_work_date and int(inf_work_date) > int(work_date):
                        for ctype in person_roles:
                            for creator in get_neighbors_by_edge_type(G, inf_work, ctype, 'in'):
                                if creator == sailor_node or creator in visited:
                                    continue
                                node_type = G.nodes[creator].get('Node Type')
                                # Compute role factor based on the influencer's (artist) roles
                                role_factor = 1/2 if ctype in artist_roles else 1/3
                                score = role_factor * sum_of_influenced_score 
                                if node_type == 'Person':
                                        if etype == 'InterpolatesFrom':
                                            if ctype == 'ComposerOf':
                                                    add_influence(creator, etype, ctype, work, inf_work, inf_work_date, score, node_type, artists_influenced_indirectly)    
                                        else: #if etype=InStyleOf, CoverOf,....
                                            print("yes")
                                            add_influence(creator, etype, ctype, work, inf_work,inf_work_date, score, node_type, artists_influenced_indirectly)
                                
                                elif node_type == 'MusicalGroup':
                                        for member in get_neighbors_by_edge_type(G, creator, member_type, 'in'):
                                            if member != sailor_node:
                                                add_influence(member, etype, ctype, work, inf_work, inf_work_date, score, node_type, artists_influenced_indirectly)
                
                
    return artists_influenced_indirectly



def main():
    G = read_data_from_json_to_graph(data_file_path)
    n, a = find_sailor_shift(G)
    print (n)
    collaborators = find_collaborators_of_sailor(G, n)
    print(f"collaborators:{collaborators}")
    print(f"# of collaborators:{len(collaborators)}")
    artists_influenced_directly = find_directly_influenced(G, n)
    print(artists_influenced_directly)
    artists_influenced_indirectly = find_indirectly_influenced(G, n, artists_influenced_directly)
    print(artists_influenced_indirectly)
    # # genres = set()  # Use a set to avoid duplicates

    # # for node, data in G.nodes(data=True):
    # #     node_type = data.get('Node Type')
    # #     if node_type in ('Album', 'Song'):
    # #         genre = data.get('genre')
    # #         if genre:
    # #             # If genre could be a list (multiple genres), handle accordingly
    # #             if isinstance(genre, list):
    # #                 genres.update(genre)
    # #             else:
    # #                 genres.add(genre)

    # # print(genres)
    sailor_works, bands = find_all_artist_works(G, n)
    print(len(bands))
    print(f"# of Sailor works:{len(sailor_works)}")
    for sailor_work in sailor_works:
        print(f"{G.nodes[sailor_work].get('genre')} in year of {G.nodes[sailor_work].get('release_date')} and notable={G.nodes[sailor_work].get('notable')}\n")
        
    genres = {}
    for node, data in G.nodes(data=True):
        if data.get('Node Type') in ('Song', 'Album'):
            genre = data.get('genre')
            if genre:
                genres[genre] = genres.get(genre, 0) + 1
    print(genres)
    print(len(genres))
if __name__ == "__main__":
    main()    
                    
            
        
    

