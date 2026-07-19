import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from pydantic import BaseModel

from .models import (
    Claim,
    AnalysisJob,
    ClaimStatusChange,
    CollaborationNote,
    Company,
    DealActivity,
    DealInvitation,
    DealMember,
    DealTask,
    DiscoveryCandidate,
    DiscoveryRun,
    Evidence,
    Founder,
    FounderScore,
    FounderScoreSnapshot,
    FundThesis,
    Segment,
    Source,
    TriggerEvent,
)


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

    def upsert_collection(self, collection: str, rows: dict[str, BaseModel], connection) -> None:
        connection.executemany(
            """
            insert into records (collection, key, payload)
            values (?, ?, ?)
            on conflict(collection, key) do update set
              payload = excluded.payload,
              updated_at = current_timestamp
            """,
            [(collection, key, value.model_dump_json()) for key, value in rows.items()],
        )

    @contextmanager
    def immediate_transaction(self):
        self.conn.execute("BEGIN IMMEDIATE")
        try:
            yield self.conn
        except Exception:
            self.conn.rollback()
            raise
        else:
            self.conn.commit()


MODEL_COLLECTIONS = {
    "companies": Company,
    "founders": Founder,
    "sources": Source,
    "segments": Segment,
    "claims": Claim,
    "evidence": Evidence,
    "founder_scores": FounderScore,
    "founder_score_history": FounderScoreSnapshot,
    "claim_status_changes": ClaimStatusChange,
    "deal_members": DealMember,
    "collaboration_notes": CollaborationNote,
    "deal_tasks": DealTask,
    "deal_activity": DealActivity,
    "deal_invitations": DealInvitation,
    "trigger_events": TriggerEvent,
    "fund_theses": FundThesis,
    "analysis_jobs": AnalysisJob,
    "discovery_candidates": DiscoveryCandidate,
    "discovery_runs": DiscoveryRun,
}
