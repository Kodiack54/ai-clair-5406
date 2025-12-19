-- Clair Enhanced Documentation System
-- Migration 002 - Rich tracking for ideas, decisions, lessons, timeline
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. DEV_AI_IDEAS - Rich idea tracking for investor presentations
-- ============================================
CREATE TABLE IF NOT EXISTS dev_ai_ideas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_path TEXT NOT NULL,
    
    -- Idea content
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    
    -- Integration analysis (Clair fills this at night)
    integration_with_existing TEXT,          -- How it fits with current system
    improvement_benefits TEXT,               -- How it improves/enhances
    diagram_ascii TEXT,                      -- ASCII diagram of implementation
    
    -- Tracking
    status VARCHAR(20) DEFAULT 'proposed',   -- proposed, exploring, implementing, implemented, shelved
    priority VARCHAR(10) DEFAULT 'medium',   -- low, medium, high
    investor_ready BOOLEAN DEFAULT FALSE,    -- Ready for investor presentation?
    
    -- Source tracking
    source_conversation_id TEXT,             -- Which conversation spawned this
    source_snippet_ids UUID[] DEFAULT '{}',  -- Related snippets
    
    -- Timestamps
    proposed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    explored_at TIMESTAMP WITH TIME ZONE,
    implemented_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE dev_ai_ideas ADD CONSTRAINT check_idea_status
    CHECK (status IN ('proposed', 'exploring', 'implementing', 'implemented', 'shelved'));

CREATE INDEX idx_ai_ideas_project ON dev_ai_ideas(project_path);
CREATE INDEX idx_ai_ideas_status ON dev_ai_ideas(status);
CREATE INDEX idx_ai_ideas_investor ON dev_ai_ideas(investor_ready) WHERE investor_ready = TRUE;

-- ============================================
-- 2. DEV_AI_DECISIONS - A/B testing and decision tracking
-- ============================================
CREATE TABLE IF NOT EXISTS dev_ai_decisions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_path TEXT NOT NULL,
    
    -- Decision context
    title VARCHAR(500) NOT NULL,
    context TEXT NOT NULL,                   -- What problem are we solving?
    
    -- Path A
    path_a_name VARCHAR(200) NOT NULL,
    path_a_description TEXT NOT NULL,
    tester_a VARCHAR(100),                   -- Who tested path A (Mike, Tiffany, etc)
    results_a TEXT,                          -- What happened with path A
    
    -- Path B
    path_b_name VARCHAR(200) NOT NULL,
    path_b_description TEXT NOT NULL,
    tester_b VARCHAR(100),                   -- Who tested path B
    results_b TEXT,                          -- What happened with path B
    
    -- Final decision
    final_decision VARCHAR(20),              -- 'a', 'b', 'hybrid', 'neither', 'pending'
    reasoning TEXT,                          -- Why this decision was made
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending',    -- pending, testing, decided, implemented
    decided_at TIMESTAMP WITH TIME ZONE,
    decided_by VARCHAR(100),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE dev_ai_decisions ADD CONSTRAINT check_decision_final
    CHECK (final_decision IS NULL OR final_decision IN ('a', 'b', 'hybrid', 'neither', 'pending'));
ALTER TABLE dev_ai_decisions ADD CONSTRAINT check_decision_status
    CHECK (status IN ('pending', 'testing', 'decided', 'implemented'));

CREATE INDEX idx_ai_decisions_project ON dev_ai_decisions(project_path);
CREATE INDEX idx_ai_decisions_status ON dev_ai_decisions(status);

-- ============================================
-- 3. DEV_AI_LESSONS - What was tried, what worked
-- ============================================
CREATE TABLE IF NOT EXISTS dev_ai_lessons (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_path TEXT NOT NULL,
    
    -- Lesson content
    title VARCHAR(500) NOT NULL,
    what_was_tried TEXT NOT NULL,            -- What we attempted to do
    the_problem TEXT NOT NULL,               -- Why it didn't work
    duration_days INT DEFAULT 1,             -- How long we fought it
    the_solution TEXT NOT NULL,              -- What actually worked
    prevention_notes TEXT,                   -- How to avoid this in future
    
    -- Categorization
    category VARCHAR(50),                    -- 'architecture', 'integration', 'performance', 'ui', etc
    severity VARCHAR(20) DEFAULT 'medium',   -- How much time was wasted: 'minor', 'medium', 'major'
    
    -- Source tracking
    related_decision_id UUID REFERENCES dev_ai_decisions(id),
    
    -- Timestamps
    lesson_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ai_lessons_project ON dev_ai_lessons(project_path);
CREATE INDEX idx_ai_lessons_category ON dev_ai_lessons(category);
CREATE INDEX idx_ai_lessons_date ON dev_ai_lessons(lesson_date DESC);

-- ============================================
-- 4. DEV_AI_TIMELINE - Milestones for investor presentations
-- ============================================
CREATE TABLE IF NOT EXISTS dev_ai_timeline (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_path TEXT NOT NULL,
    
    -- Milestone content
    milestone_type VARCHAR(20) NOT NULL,     -- 'phase', 'feature', 'release', 'pivot', 'funding', 'team'
    title VARCHAR(500) NOT NULL,
    description TEXT,
    achievement TEXT NOT NULL,               -- What was accomplished
    impact TEXT,                             -- Business/technical impact
    
    -- Visual elements
    icon VARCHAR(50),                        -- Emoji or icon name for timeline display
    color VARCHAR(20),                       -- Color coding for timeline
    
    -- Dates
    milestone_date DATE NOT NULL,
    
    -- For investor decks
    investor_highlight BOOLEAN DEFAULT FALSE,
    metrics JSONB DEFAULT '{}',              -- {"users": 100, "revenue": 5000, etc}
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE dev_ai_timeline ADD CONSTRAINT check_milestone_type
    CHECK (milestone_type IN ('phase', 'feature', 'release', 'pivot', 'funding', 'team', 'achievement'));

CREATE INDEX idx_ai_timeline_project ON dev_ai_timeline(project_path);
CREATE INDEX idx_ai_timeline_date ON dev_ai_timeline(milestone_date DESC);
CREATE INDEX idx_ai_timeline_investor ON dev_ai_timeline(investor_highlight) WHERE investor_highlight = TRUE;

-- ============================================
-- 5. DEV_AI_SNIPPETS - Raw daily data before compilation
-- ============================================
CREATE TABLE IF NOT EXISTS dev_ai_snippets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_path TEXT NOT NULL,
    
    -- Snippet content
    snippet_type VARCHAR(30) NOT NULL,       -- 'conversation', 'code_change', 'bug_fix', 'feature', 'config'
    content TEXT NOT NULL,
    context TEXT,                            -- Additional context about the snippet
    
    -- Source tracking
    conversation_id TEXT,                    -- Which Claude conversation
    session_id TEXT,                         -- Which dev session
    
    -- Compilation tracking
    is_compiled BOOLEAN DEFAULT FALSE,
    compiled_into UUID,                      -- FK to dev_ai_journal when compiled
    compiled_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    snippet_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE dev_ai_snippets ADD CONSTRAINT check_snippet_type
    CHECK (snippet_type IN ('conversation', 'code_change', 'bug_fix', 'feature', 'config', 'discussion', 'idea', 'decision'));

CREATE INDEX idx_ai_snippets_project ON dev_ai_snippets(project_path);
CREATE INDEX idx_ai_snippets_date ON dev_ai_snippets(snippet_date);
CREATE INDEX idx_ai_snippets_uncompiled ON dev_ai_snippets(is_compiled) WHERE is_compiled = FALSE;
CREATE INDEX idx_ai_snippets_compiled_into ON dev_ai_snippets(compiled_into);

-- ============================================
-- 6. DEV_AI_CLAIR_SCHEDULE - Job scheduling for day/night work
-- ============================================
CREATE TABLE IF NOT EXISTS dev_ai_clair_schedule (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Job info
    job_type VARCHAR(30) NOT NULL,           -- 'day_organize', 'night_compile', 'doc_update', 'structure_scan'
    job_name VARCHAR(200) NOT NULL,
    
    -- Schedule
    schedule_cron VARCHAR(100),              -- Cron expression
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    
    -- Status
    status VARCHAR(20) DEFAULT 'idle',       -- 'idle', 'running', 'completed', 'failed'
    last_result JSONB DEFAULT '{}',          -- {success: true, items_processed: 50, errors: []}
    last_error TEXT,
    
    -- Config
    is_enabled BOOLEAN DEFAULT TRUE,
    config JSONB DEFAULT '{}',               -- Job-specific configuration
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE dev_ai_clair_schedule ADD CONSTRAINT check_job_type
    CHECK (job_type IN ('day_organize', 'night_compile', 'doc_update', 'structure_scan', 'convention_sync', 'timeline_update'));
ALTER TABLE dev_ai_clair_schedule ADD CONSTRAINT check_job_status
    CHECK (status IN ('idle', 'running', 'completed', 'failed', 'skipped'));

CREATE UNIQUE INDEX idx_ai_clair_schedule_job ON dev_ai_clair_schedule(job_type, job_name);

-- ============================================
-- 7. Seed initial Clair schedule jobs
-- ============================================
INSERT INTO dev_ai_clair_schedule (job_type, job_name, schedule_cron, config, is_enabled) VALUES
    ('day_organize', 'Organize Susan Buckets', '*/30 6-23 * * *', '{"model": "gpt-4o", "check_buckets": ["todos", "bugs", "knowledge"]}', TRUE),
    ('day_organize', 'Update TODO Checklists', '0 * 6-23 * * *', '{"model": "gpt-4o-mini"}', TRUE),
    ('night_compile', 'Daily Journal Entry', '0 2 * * *', '{"model": "claude-3-opus", "compile_snippets": true}', TRUE),
    ('night_compile', 'Update Documentation', '30 2 * * *', '{"model": "claude-3-sonnet", "doc_types": ["howto", "schematic", "breakdown"]}', TRUE),
    ('night_compile', 'Process Ideas', '0 3 * * *', '{"model": "claude-3-opus", "analyze_integration": true}', TRUE),
    ('structure_scan', 'Scan Project Structure', '0 4 * * *', '{"model": "gpt-4o-mini", "add_descriptions": true}', TRUE),
    ('convention_sync', 'Sync Code Conventions', '30 4 * * *', '{"model": "gpt-4o-mini"}', TRUE),
    ('timeline_update', 'Update Project Timeline', '0 5 * * *', '{"model": "claude-3-sonnet", "check_milestones": true}', TRUE)
ON CONFLICT (job_type, job_name) DO NOTHING;

-- ============================================
-- 8. Update triggers for updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_ai_ideas_updated_at ON dev_ai_ideas;
CREATE TRIGGER update_ai_ideas_updated_at
    BEFORE UPDATE ON dev_ai_ideas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_decisions_updated_at ON dev_ai_decisions;
CREATE TRIGGER update_ai_decisions_updated_at
    BEFORE UPDATE ON dev_ai_decisions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_clair_schedule_updated_at ON dev_ai_clair_schedule;
CREATE TRIGGER update_ai_clair_schedule_updated_at
    BEFORE UPDATE ON dev_ai_clair_schedule
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Done! Enhanced Clair tables created.
-- ============================================

-- Summary of new tables:
-- dev_ai_ideas           - Rich idea tracking with integration analysis
-- dev_ai_decisions       - A/B testing and decision tracking  
-- dev_ai_lessons         - What was tried, what worked
-- dev_ai_timeline        - Milestones for investor presentations
-- dev_ai_snippets        - Raw daily data before journal compilation
-- dev_ai_clair_schedule  - Day/night job scheduling
