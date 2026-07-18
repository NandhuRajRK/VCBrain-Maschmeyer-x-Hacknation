import os
import sqlite3
from pathlib import Path

from pydantic import BaseModel

from .models import Claim, Company, Evidence, Founder, FounderScore, Segment, Source, TriggerEvent


DB_PATH = Path(os.getenv("VCBRAIN_DB_PATH", "data/processed/vcbrain.sqlite3"))


class JsonSqliteStore:
    def __init__(self, path: Path = DB_PATH) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path, check_same_thread=False)
        self.conn.execute(
            """
            create table if not exists records (
                collection text not null,
                key text not null,
                payload text not null,
                updated_at text default current_timestamp,
                primary key (collection, key)
            )
            """
        )

    def load_collection(self, collection: str, model: type[BaseModel]) -> dict[str, BaseModel]:
        rows = self.conn.execute(
            "select key, payload from records where collection = ?",
            (collection,),
        ).fetchall()
        return {key: model.model_validate_json(payload) for key, payload in rows}

    def save_collection(self, collection: str, rows: dict[str, BaseModel]) -> None:
        with self.conn:
            self.conn.execute("delete from records where collection = ?", (collection,))
            self.conn.executemany(
                """
                insert into records (collection, key, payload)
                values (?, ?, ?)
                on conflict(collection, key) do update set
                  payload = excluded.payload,
                  updated_at = current_timestamp
                """,
                [
                    (collection, key, value.model_dump_json())
                    for key, value in rows.items()
                ],
            )


MODEL_COLLECTIONS = {
    "companies": Company,
    "founders": Founder,
    "sources": Source,
    "segments": Segment,
    "claims": Claim,
    "evidence": Evidence,
    "founder_scores": FounderScore,
    "trigger_events": TriggerEvent,
}
