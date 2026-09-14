import json

# Define the correct order of dialogue IDs
clip_order = [
    908,
    1083,
    1045,
    49,
    2080,
    110,
    1018,
    1148,
    159,
    2280,
    2381,
    1046
]

# Read all annotations
annotations = {}
with open('all_clips_annotations_final.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        ann = json.loads(line)
        # Extract dialogue ID from the full ID
        full_id = ann['id']
        dialog_id = int(full_id.split('_')[1])
        annotations[dialog_id] = ann

# Add d_1046
with open('d_1046_annotation.jsonl', 'r', encoding='utf-8') as f:
    ann = json.loads(f.read().strip())
    annotations[1046] = ann

# Write in correct order
with open('all_clips_annotations_final.jsonl', 'w', encoding='utf-8') as f:
    for dialog_id in clip_order:
        if dialog_id in annotations:
            f.write(json.dumps(annotations[dialog_id], ensure_ascii=False) + '\n')
            print(f"Added d_{dialog_id}")
        else:
            print(f"Missing d_{dialog_id}")

print("\nRebuilt annotations file with correct order")
