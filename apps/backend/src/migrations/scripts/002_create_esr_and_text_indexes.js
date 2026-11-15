/**
 * Migration: 002_create_esr_and_text_indexes.js
 * Establishes compound Equality-Sort-Range (ESR) and full-text search indexes across Mongoose collections (SEC-DB-02, SEC-DB-05).
 */
export const up = async ({ db }) => {
  console.log('   Creating compound ESR and text search indexes on collections...');

  // 1. Job Requirements ESR and Full-Text Indexes
  try {
    await db.collection('jobrequirements').createIndex(
      { isRequisition: 1, createdAt: -1, status: 1 },
      { name: 'idx_job_openings_esr' }
    );
    await db.collection('jobrequirements').createIndex(
      { isRequisition: 1, status: 1, createdAt: -1 },
      { name: 'idx_job_requisitions_esr' }
    );
    await db.collection('jobrequirements').createIndex(
      { title: 'text', description: 'text', requirements: 'text', requiredSkills: 'text', client: 'text' },
      { name: 'idx_job_text_search' }
    );
  } catch (e) {
    console.warn('   Note on jobrequirements ESR index:', e.message);
  }

  // 2. Candidates ESR and Full-Text Indexes
  try {
    await db.collection('candidates').createIndex(
      { jobId: 1, createdAt: -1 },
      { name: 'idx_candidates_job_date_esr' }
    );
    await db.collection('candidates').createIndex(
      { name: 'text', currentRole: 'text', technicalSkills: 'text', positionApplied: 'text' },
      { name: 'idx_candidate_text_search' }
    );
  } catch (e) {
    console.warn('   Note on candidates ESR index:', e.message);
  }

  // 3. Job Applications ESR Index
  try {
    await db.collection('jobapplications').createIndex(
      { jobId: 1, status: 1, createdAt: -1 },
      { name: 'idx_jobapp_job_status_date_esr' }
    );
  } catch (e) {
    console.warn('   Note on jobapplications ESR index:', e.message);
  }

  // 4. Clients ESR Index
  try {
    await db.collection('clients').createIndex(
      { status: 1, createdAt: -1 },
      { name: 'idx_clients_status_date_esr' }
    );
  } catch (e) {
    console.warn('   Note on clients ESR index:', e.message);
  }

  // 5. Placements ESR Index
  try {
    await db.collection('placements').createIndex(
      { assignmentStatus: 1, createdAt: -1 },
      { name: 'idx_placements_status_date_esr' }
    );
    await db.collection('placements').createIndex(
      { clientName: 1, createdAt: -1 },
      { name: 'idx_placements_client_date_esr' }
    );
  } catch (e) {
    console.warn('   Note on placements ESR index:', e.message);
  }

  // 6. Articles ESR Index
  try {
    await db.collection('articles').createIndex(
      { category: 1, status: 1, createdAt: -1 },
      { name: 'idx_articles_cat_status_date_esr' }
    );
  } catch (e) {
    console.warn('   Note on articles ESR index:', e.message);
  }

  // 7. Employees ESR Index
  try {
    await db.collection('employees').createIndex(
      { deploymentStatus: 1, createdAt: -1 },
      { name: 'idx_employees_status_date_esr' }
    );
  } catch (e) {
    console.warn('   Note on employees ESR index:', e.message);
  }

  console.log('   ✓ Compound ESR and text search indexes established successfully.');
};

export const down = async ({ db }) => {
  console.log('   Reverting compound ESR and text search indexes...');
  const drops = [
    { col: 'jobrequirements', idx: 'idx_job_openings_esr' },
    { col: 'jobrequirements', idx: 'idx_job_requisitions_esr' },
    { col: 'jobrequirements', idx: 'idx_job_text_search' },
    { col: 'candidates', idx: 'idx_candidates_job_date_esr' },
    { col: 'candidates', idx: 'idx_candidate_text_search' },
    { col: 'jobapplications', idx: 'idx_jobapp_job_status_date_esr' },
    { col: 'clients', idx: 'idx_clients_status_date_esr' },
    { col: 'placements', idx: 'idx_placements_status_date_esr' },
    { col: 'placements', idx: 'idx_placements_client_date_esr' },
    { col: 'articles', idx: 'idx_articles_cat_status_date_esr' },
    { col: 'employees', idx: 'idx_employees_status_date_esr' },
  ];

  for (const { col, idx } of drops) {
    try {
      await db.collection(col).dropIndex(idx);
    } catch {}
  }
};
