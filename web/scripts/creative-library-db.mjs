import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

export const defaultCreativeLibraryDbFile = path.join(appRoot, "data", "creative-library.sqlite");

export function openCreativeLibraryDb(file = process.env.CREATIVE_LIBRARY_DB || defaultCreativeLibraryDbFile) {
    const resolved = path.resolve(file);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const db = new DatabaseSync(resolved);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA busy_timeout = 5000");
    migrate(db);
    return { db, file: resolved };
}

function migrate(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS library_sources (
            id TEXT PRIMARY KEY,
            library_type TEXT NOT NULL CHECK (library_type IN ('knowledge', 'case')),
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            kind TEXT NOT NULL,
            source TEXT NOT NULL,
            layer TEXT NOT NULL DEFAULT 'private',
            authority REAL NOT NULL DEFAULT 0.7,
            verified INTEGER NOT NULL DEFAULT 0,
            chars INTEGER NOT NULL DEFAULT 0,
            chunks INTEGER NOT NULL DEFAULT 0,
            content_hash TEXT NOT NULL DEFAULT '',
            ingest_mode TEXT NOT NULL DEFAULT 'local',
            status TEXT NOT NULL DEFAULT 'queued',
            error_message TEXT NOT NULL DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_ingested_at TEXT
        );

        CREATE TABLE IF NOT EXISTS knowledge_cards (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            principle TEXT NOT NULL,
            layer TEXT NOT NULL,
            status TEXT NOT NULL,
            confidence REAL NOT NULL,
            authority REAL NOT NULL,
            card_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS knowledge_card_sources (
            card_id TEXT NOT NULL REFERENCES knowledge_cards(id) ON DELETE CASCADE,
            source_id TEXT NOT NULL REFERENCES library_sources(id) ON DELETE CASCADE,
            PRIMARY KEY (card_id, source_id)
        );

        CREATE TABLE IF NOT EXISTS story_cases (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL UNIQUE REFERENCES library_sources(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            status TEXT NOT NULL,
            confidence REAL NOT NULL,
            case_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ingest_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_type TEXT NOT NULL,
            source_key TEXT NOT NULL,
            source_path TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'queued',
            attempt_count INTEGER NOT NULL DEFAULT 0,
            error_message TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sources_library_status
            ON library_sources(library_type, status);
        CREATE INDEX IF NOT EXISTS idx_cards_status_category
            ON knowledge_cards(status, category);
        CREATE INDEX IF NOT EXISTS idx_jobs_status_created
            ON ingest_jobs(status, created_at);
    `);
}

export function contentHash(value) {
    return createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

export function startIngestJob(db, { jobType, sourceKey, sourcePath = "" }) {
    const now = new Date().toISOString();
    const previous = db.prepare("SELECT MAX(attempt_count) AS attempts FROM ingest_jobs WHERE job_type = ? AND source_key = ?").get(jobType, sourceKey);
    const attemptCount = Number(previous?.attempts) + 1 || 1;
    const result = db
        .prepare(`
            INSERT INTO ingest_jobs (
                job_type, source_key, source_path, status, attempt_count,
                created_at, started_at, updated_at
            ) VALUES (?, ?, ?, 'running', ?, ?, ?, ?)
        `)
        .run(jobType, sourceKey, sourcePath, attemptCount, now, now, now);
    pruneJobs(db);
    return Number(result.lastInsertRowid);
}

export function finishIngestJob(db, jobId, { status = "completed", error = "" } = {}) {
    const now = new Date().toISOString();
    db.prepare(`
        UPDATE ingest_jobs
        SET status = ?, error_message = ?, finished_at = ?, updated_at = ?
        WHERE id = ?
    `).run(status, String(error || "").slice(0, 2000), now, now, jobId);
}

function pruneJobs(db) {
    db.exec(`
        DELETE FROM ingest_jobs
        WHERE id IN (
            SELECT id FROM ingest_jobs
            WHERE status IN ('completed', 'failed')
            ORDER BY id DESC
            LIMIT -1 OFFSET 500
        )
    `);
}

export function readCachedSource(db, { id, libraryType, hash, ingestMode }) {
    return db
        .prepare(`
            SELECT * FROM library_sources
            WHERE id = ? AND library_type = ? AND content_hash = ?
              AND ingest_mode = ? AND status = 'completed'
        `)
        .get(id, libraryType, hash, ingestMode);
}

export function upsertLibrarySource(db, source, { libraryType, hash, ingestMode, status = "completed", error = "", metadata = {} }) {
    const now = new Date().toISOString();
    db.prepare(`
        INSERT INTO library_sources (
            id, library_type, title, category, kind, source, layer, authority,
            verified, chars, chunks, content_hash, ingest_mode, status,
            error_message, metadata_json, created_at, updated_at, last_ingested_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            library_type = excluded.library_type,
            title = excluded.title,
            category = excluded.category,
            kind = excluded.kind,
            source = excluded.source,
            layer = excluded.layer,
            authority = excluded.authority,
            verified = excluded.verified,
            chars = excluded.chars,
            chunks = excluded.chunks,
            content_hash = excluded.content_hash,
            ingest_mode = excluded.ingest_mode,
            status = excluded.status,
            error_message = excluded.error_message,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at,
            last_ingested_at = excluded.last_ingested_at
    `).run(
        source.id,
        libraryType,
        source.title,
        source.category,
        source.kind,
        source.source,
        source.layer || "private",
        Number(source.authority) || 0.7,
        source.verified ? 1 : 0,
        Number(source.chars ?? source.text?.length) || 0,
        Number(source.chunks?.length ?? source.chunks) || 0,
        hash,
        ingestMode,
        status,
        String(error || "").slice(0, 2000),
        JSON.stringify(metadata || {}),
        now,
        now,
        status === "completed" ? now : null,
    );
}

export function readKnowledgeCardsForSource(db, sourceId) {
    return db
        .prepare(`
            SELECT c.card_json
            FROM knowledge_cards c
            JOIN knowledge_card_sources cs ON cs.card_id = c.id
            WHERE cs.source_id = ?
            ORDER BY c.id
        `)
        .all(sourceId)
        .flatMap((row) => safeJson(row.card_json));
}

export function replaceKnowledgeCardsForSource(db, sourceId, cards) {
    const now = new Date().toISOString();
    const oldCardIds = db.prepare("SELECT card_id FROM knowledge_card_sources WHERE source_id = ?").all(sourceId).map((row) => row.card_id);
    db.exec("BEGIN IMMEDIATE");
    try {
        db.prepare("DELETE FROM knowledge_card_sources WHERE source_id = ?").run(sourceId);
        const upsert = db.prepare(`
            INSERT INTO knowledge_cards (
                id, title, category, principle, layer, status, confidence,
                authority, card_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                category = excluded.category,
                principle = excluded.principle,
                layer = excluded.layer,
                status = excluded.status,
                confidence = excluded.confidence,
                authority = excluded.authority,
                card_json = excluded.card_json,
                updated_at = excluded.updated_at
        `);
        const connect = db.prepare("INSERT OR IGNORE INTO knowledge_card_sources (card_id, source_id) VALUES (?, ?)");
        for (const card of cards) {
            upsert.run(card.id, card.title, card.category, card.principle, card.layer, card.status, card.confidence, card.authority, JSON.stringify(card), now, now);
            connect.run(card.id, sourceId);
        }
        const removeOrphan = db.prepare("DELETE FROM knowledge_cards WHERE id = ? AND NOT EXISTS (SELECT 1 FROM knowledge_card_sources WHERE card_id = ?)");
        for (const cardId of oldCardIds) removeOrphan.run(cardId, cardId);
        db.exec("COMMIT");
    } catch (error) {
        db.exec("ROLLBACK");
        throw error;
    }
}

export function replaceKnowledgeSnapshot(db, { sources, cards, ingestMode = "user-confirmed" }) {
    const now = new Date().toISOString();
    const sourceIds = new Set(sources.map((source) => source.id));
    for (const card of cards) {
        const missingSource = (card.sourceIds || []).find((sourceId) => !sourceIds.has(sourceId));
        if (missingSource) throw new Error(`知识卡 ${card.id} 引用了不存在的来源 ${missingSource}`);
    }

    db.exec("BEGIN IMMEDIATE");
    try {
        db.exec(`
            DELETE FROM knowledge_card_sources
            WHERE source_id IN (SELECT id FROM library_sources WHERE library_type = 'knowledge');
            DELETE FROM knowledge_cards;
            DELETE FROM library_sources WHERE library_type = 'knowledge';
        `);

        const insertSource = db.prepare(`
            INSERT INTO library_sources (
                id, library_type, title, category, kind, source, layer, authority,
                verified, chars, chunks, content_hash, ingest_mode, status,
                error_message, metadata_json, created_at, updated_at, last_ingested_at
            ) VALUES (?, 'knowledge', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', '', ?, ?, ?, ?)
        `);
        for (const source of sources) {
            const metadata = {
                scope: source.scope || "specialist",
                workId: source.workId || "",
                language: source.language || "",
                userConfirmedAt: now,
            };
            insertSource.run(
                source.id,
                source.title,
                source.category,
                source.kind,
                source.source,
                source.layer || "private",
                Number(source.authority) || 0.7,
                source.verified ? 1 : 0,
                Number(source.chars) || 0,
                Number(source.chunks) || 0,
                contentHash(JSON.stringify(source)),
                ingestMode,
                JSON.stringify(metadata),
                now,
                now,
                now,
            );
        }

        const insertCard = db.prepare(`
            INSERT INTO knowledge_cards (
                id, title, category, principle, layer, status, confidence,
                authority, card_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const connect = db.prepare("INSERT INTO knowledge_card_sources (card_id, source_id) VALUES (?, ?)");
        for (const card of cards) {
            insertCard.run(card.id, card.title, card.category, card.principle, card.layer || "private", card.status, Number(card.confidence) || 0.5, Number(card.authority) || 0.65, JSON.stringify(card), now, now);
            for (const sourceId of card.sourceIds || []) connect.run(card.id, sourceId);
        }
        db.exec("COMMIT");
    } catch (error) {
        db.exec("ROLLBACK");
        throw error;
    }
}

export function readStoryCaseForSource(db, sourceId) {
    const row = db.prepare("SELECT case_json FROM story_cases WHERE source_id = ?").get(sourceId);
    return row ? safeJson(row.case_json) : null;
}

export function upsertStoryCase(db, sourceId, storyCase) {
    const now = new Date().toISOString();
    db.prepare(`
        INSERT INTO story_cases (
            id, source_id, title, category, status, confidence,
            case_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            source_id = excluded.source_id,
            title = excluded.title,
            category = excluded.category,
            status = excluded.status,
            confidence = excluded.confidence,
            case_json = excluded.case_json,
            updated_at = excluded.updated_at
    `).run(storyCase.id, sourceId, storyCase.title, storyCase.category, storyCase.status, storyCase.confidence, JSON.stringify(storyCase), now, now);
}

export function databaseSummary(db) {
    const count = (table, where = "") => Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get().count);
    return {
        sources: count("library_sources"),
        knowledgeSources: count("library_sources", "WHERE library_type = 'knowledge'"),
        caseSources: count("library_sources", "WHERE library_type = 'case'"),
        cards: count("knowledge_cards"),
        activeCards: count("knowledge_cards", "WHERE status = 'verified'"),
        cases: count("story_cases"),
        activeCases: count("story_cases", "WHERE status = 'verified'"),
        queuedJobs: count("ingest_jobs", "WHERE status IN ('queued', 'running')"),
        failedJobs: count("ingest_jobs", "WHERE status = 'failed'"),
    };
}

function safeJson(value) {
    try {
        return JSON.parse(String(value || "null"));
    } catch {
        return null;
    }
}
