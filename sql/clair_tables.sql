-- Clair AI Worker Tables
-- Run this in Supabase SQL Editor
-- These tables support Clair's documentation management features

-- ============================================
-- 1. DEV_AI_JOURNAL - Project work logs, ideas, decisions, lessons
-- ============================================
CREATE TABLE IF NOT EXISTS dev_ai_journal (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_path TEXT NOT NULL,

    -- Entry content
    entry_type VARCHAR(20) NOT NULL,           -- 'work_log', 'idea', 'decision', 'lesson'
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,

    -- Metadata
    created_by VARCHAR(100) DEFAULT 'clair',   -- Who created this entry

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add check constraint for entry_type
ALTER TABLE dev_ai_journal ADD CONSTRAINT check_entry_type
    CHECK (entry_type IN ('work_log', 'idea', 'decision', 'lesson'));

CREATE INDEX idx_ai_journal_project ON dev_ai_journal(project_path);
CREATE INDEX idx_ai_journal_type ON dev_ai_journal(entry_type);
CREATE INDEX idx_ai_journal_created ON dev_ai_journal(created_at DESC);

-- ============================================
-- 2. DEV_AI_GENERATED_DOCS - Technical docs, how-tos, schematics
-- ============================================
CREATE TABLE IF NOT EXISTS dev_ai_generated_docs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_path TEXT NOT NULL,

    -- Document content
    doc_type VARCHAR(30) NOT NULL,             -- 'howto', 'schematic', 'breakdown', 'reference', 'guide'
    title VARCHAR(500) NOT NULL,
    content TEXT,

    -- Generation info
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    source_ids UUID[] DEFAULT '{}',            -- IDs of source knowledge entries

    -- Publishing status
    is_published BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add check constraint for doc_type
ALTER TABLE dev_ai_generated_docs ADD CONSTRAINT check_doc_type
    CHECK (doc_type IN ('howto', 'schematic', 'breakdown', 'reference', 'guide'));

CREATE INDEX idx_ai_generated_docs_project ON dev_ai_generated_docs(project_path);
CREATE INDEX idx_ai_generated_docs_type ON dev_ai_generated_docs(doc_type);
CREATE INDEX idx_ai_generated_docs_published ON dev_ai_generated_docs(is_published);

-- ============================================
-- 3. DEV_AI_FOLDER_DESCRIPTIONS - Structure annotations
-- ============================================
CREATE TABLE IF NOT EXISTS dev_ai_folder_descriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_path TEXT NOT NULL,
    folder_path TEXT NOT NULL,                 -- Relative path within project

    -- Description
    description TEXT NOT NULL,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique constraint: one description per folder per project
    UNIQUE(project_path, folder_path)
);

CREATE INDEX idx_ai_folder_desc_project ON dev_ai_folder_descriptions(project_path);

-- ============================================
-- 4. DEV_AI_CONVENTIONS - Coding patterns for Claude
-- ============================================
CREATE TABLE IF NOT EXISTS dev_ai_conventions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_path TEXT NOT NULL,

    -- Convention content
    category VARCHAR(30) NOT NULL,             -- 'naming', 'structure', 'database', 'api', 'quirk', 'stack', 'pattern'
    pattern VARCHAR(500) NOT NULL,             -- The convention/pattern description
    example TEXT,                              -- Code example if applicable
    notes TEXT,                                -- Additional notes/explanation

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add check constraint for category
ALTER TABLE dev_ai_conventions ADD CONSTRAINT check_convention_category
    CHECK (category IN ('naming', 'structure', 'database', 'api', 'quirk', 'stack', 'pattern'));

CREATE INDEX idx_ai_conventions_project ON dev_ai_conventions(project_path);
CREATE INDEX idx_ai_conventions_category ON dev_ai_conventions(category);

-- ============================================
-- 5. Add 'archived' status to dev_ai_bugs if not exists
-- ============================================
-- This alters the existing bugs table to support archiving
DO $$
BEGIN
    -- Check if the constraint exists and alter if needed
    -- The existing table might have: 'open', 'investigating', 'fixed', 'wont_fix', 'duplicate'
    -- We want to add 'archived'

    -- First, drop the old constraint if it exists
    ALTER TABLE dev_ai_bugs DROP CONSTRAINT IF EXISTS check_bug_status;

    -- Add new constraint with archived status
    ALTER TABLE dev_ai_bugs ADD CONSTRAINT check_bug_status
        CHECK (status IN ('open', 'investigating', 'fixed', 'wont_fix', 'duplicate', 'archived'));

EXCEPTION
    WHEN others THEN
        -- Table might not exist or constraint might not exist, that's ok
        RAISE NOTICE 'Could not alter dev_ai_bugs constraint: %', SQLERRM;
END $$;

-- ============================================
-- Done! Clair tables created successfully.
-- ============================================

-- Summary of new tables:
-- dev_ai_journal            - Project work logs, ideas, decisions, lessons
-- dev_ai_generated_docs     - Technical documentation (how-tos, schematics)
-- dev_ai_folder_descriptions - File tree annotations
-- dev_ai_conventions        - Coding patterns for Claude reference
