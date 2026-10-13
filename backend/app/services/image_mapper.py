from typing import List, Dict, Any

def map_images_to_sentences(image_ids: List[str], sentences: List[Dict[str, Any]], mode: str = "sequential") -> List[Dict[str, Any]]:
    """
    Maps image asset IDs to sentences.
    - If equal: 1:1 mapping.
    - If fewer images than sentences: cyclically reuses images sequentially.
    - If more images than sentences: uses first N images, leaves extras unused.
    Returns a list of dicts: {"sentence": sentence_dict, "imageId": image_id}
    """
    if not sentences:
        return []
    
    if not image_ids:
        # Fallback if no images uploaded yet
        return [{"sentence": s, "imageId": None} for s in sentences]

    mapped = []
    num_images = len(image_ids)
    
    for i, sentence in enumerate(sentences):
        image_id = image_ids[i % num_images]
        mapped.append({
            "sentence": sentence,
            "imageId": image_id
        })
        
    return mapped
