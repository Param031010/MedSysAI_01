"""1-Click Database Importer for MedSysAI.

Restores all collections from medsys_backup.json into target MongoDB.
"""

import json
import os
from bson import ObjectId
from app.db import get_db

BACKUP_FILE = "medsys_backup.json"


def import_database():
    if not os.path.exists(BACKUP_FILE):
        print(f"[ERROR] Backup file '{BACKUP_FILE}' not found!")
        print("Please place 'medsys_backup.json' into the backend directory and try again.")
        return

    db = get_db()
    with open(BACKUP_FILE, "r", encoding="utf-8") as f:
        backup_data = json.load(f)

    print(f"[IMPORT] Restoring MedSysAI database from '{BACKUP_FILE}'...")
    total_imported = 0

    for coll_name, docs in backup_data.items():
        if not docs:
            continue
        
        # Clean existing records in target collection to avoid duplicate _id conflicts
        db[coll_name].delete_many({})

        # Convert _id string back to ObjectId if applicable
        prepared_docs = []
        for d in docs:
            if "_id" in d and isinstance(d["_id"], str) and len(d["_id"]) == 24:
                try:
                    d["_id"] = ObjectId(d["_id"])
                except Exception:
                    pass
            prepared_docs.append(d)

        db[coll_name].insert_many(prepared_docs)
        total_imported += len(prepared_docs)
        print(f"  * Restored {len(prepared_docs)} documents into '{coll_name}'")

    print("\n=================================================================")
    print(f"[OK] IMPORT COMPLETE! Total Documents Restored: {total_imported}")
    print("=================================================================")
    print("Your new computer now has 100% of your MedSysAI data!")
    print("=================================================================\n")


if __name__ == "__main__":
    import_database()
