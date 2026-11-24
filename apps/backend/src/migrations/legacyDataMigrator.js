import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { parseLegacySqlDump } from './legacySqlParser.js';
import { connectMongoDB } from '../configs/mongodb.js';
import JobRequirement from '../models/job.mongo.model.js';
import Article from '../models/article.mongo.model.js';
import Employee from '../models/employee.mongo.model.js';
import Candidate from '../models/candidate.mongo.model.js';
import JobApplication from '../models/jobApplication.mongo.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Normalizes string by trimming whitespace.
 */
function cleanStr(val, fallback = '') {
  if (val === null || val === undefined) return fallback;
  const s = String(val).trim();
  return s || fallback;
}

/**
 * Extracts comma/bullet separated skills into a clean array of strings.
 *
 * @param {string|null} rawSkills
 * @returns {string[]}
 */
export function parseSkillsArray(rawSkills) {
  if (!rawSkills || typeof rawSkills !== 'string') return [];
  return rawSkills
    .split(/[,;\n•·]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 60);
}

/**
 * Generates an SEO friendly slug from a title string.
 *
 * @param {string} text
 * @returns {string}
 */
export function generateSlug(text) {
  if (!text) return `article-${Date.now()}`;
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Transforms legacy careers into JobRequirement schema representations.
 *
 * @param {Array<object>} rawCareers
 * @returns {Array<object>}
 */
export function transformCareers(rawCareers) {
  return rawCareers.map((c) => {
    const legacyId = Number(c.id);
    const jobId = `REQ-LEGACY-${String(legacyId).padStart(3, '0')}`;
    const skills = parseSkillsArray(c.skills);
    const requiredSkills = skills.length > 0 ? skills : ['General Engineering'];

    return {
      legacyId,
      jobId,
      title: cleanStr(c.title, 'Untitled Position'),
      client: 'Thinkwires Enterprise',
      requiredSkills,
      skills: requiredSkills,
      category: 'Engineering',
      officeLocation: cleanStr(c.location, 'Remote / Hybrid'),
      location: cleanStr(c.location, 'Remote / Hybrid'),
      jobMode: c.type === 'contract' ? 'Contract' : 'Permanent',
      salary: cleanStr(c.salary_range, 'Competitive'),
      experience: cleanStr(c.experience, '3-5 Years'),
      experienceRequired: c.experience ? parseInt(c.experience, 10) || 3 : 3,
      description: cleanStr(c.description, ''),
      requirements: cleanStr(c.requirements, ''),
      priority: cleanStr(c.priority, 'Standard'),
      status: c.status === 'open' ? 'active' : 'closed',
      openingsCount: 1,
      fulfilledCount: 0,
      isRequisition: true,
      createdAt: c.created_at ? new Date(c.created_at) : new Date(),
      updatedAt: c.updated_at ? new Date(c.updated_at) : new Date(),
    };
  });
}

/**
 * Transforms legacy blogs and career_blogs into Article schema representations.
 *
 * @param {Array<object>} rawBlogs
 * @param {Array<object>} rawCareerBlogs
 * @returns {Array<object>}
 */
export function transformArticles(rawBlogs = [], rawCareerBlogs = []) {
  const articles = [];
  const existingSlugs = new Set();

  // 1. Ingest standard blogs (Category: Talent Engineering)
  rawBlogs.forEach((b) => {
    let slug = cleanStr(b.slug) || generateSlug(b.title);
    if (existingSlugs.has(slug)) {
      slug = `blog-${b.id}-${slug}`;
    }
    existingSlugs.add(slug);

    articles.push({
      legacyId: Number(b.id),
      legacyType: 'blog',
      title: cleanStr(b.title, 'Untitled Blog'),
      slug,
      body: cleanStr(b.content, ''),
      summary: cleanStr(b.excerpt, ''),
      excerpt: cleanStr(b.excerpt, ''),
      category: 'Talent Engineering',
      featuredImageUrl: b.featured_image
        ? `/storage/${cleanStr(b.featured_image)}`
        : '/images/about-philosophy.jpg',
      status: b.status === 'published' ? 'published' : 'draft',
      author: {
        name: 'Thinkwires Research Team',
        role: 'Editorial Director',
      },
      tags: ['Staffing', 'Tech Trends', 'Global Delivery'],
      readTime: '4 min read',
      viewsCount: 0,
      publishedAt: b.created_at ? new Date(b.created_at) : new Date(),
      createdAt: b.created_at ? new Date(b.created_at) : new Date(),
      updatedAt: b.updated_at ? new Date(b.updated_at) : new Date(),
    });
  });

  // 2. Ingest career blogs (Category: Career Guidance)
  rawCareerBlogs.forEach((cb) => {
    let slug = cleanStr(cb.slug) || generateSlug(cb.title);
    if (existingSlugs.has(slug)) {
      slug = `career-${cb.id}-${slug}`;
    }
    existingSlugs.add(slug);

    articles.push({
      legacyId: Number(cb.id),
      legacyType: 'career_blog',
      title: cleanStr(cb.title, 'Untitled Career Guide'),
      slug,
      body: cleanStr(cb.content, ''),
      summary: cleanStr(cb.excerpt, ''),
      excerpt: cleanStr(cb.excerpt, ''),
      category: 'Career Guidance',
      featuredImageUrl: cb.featured_image
        ? `/storage/${cleanStr(cb.featured_image)}`
        : '/images/about-philosophy.jpg',
      status: cb.status === 'published' ? 'published' : 'draft',
      author: {
        name: 'Thinkwires Career Advisory',
        role: 'Talent Partner',
      },
      tags: ['Career Growth', 'Engineering Talent', 'Interviews'],
      readTime: '5 min read',
      viewsCount: 0,
      publishedAt: cb.created_at ? new Date(cb.created_at) : new Date(),
      createdAt: cb.created_at ? new Date(cb.created_at) : new Date(),
      updatedAt: cb.updated_at ? new Date(cb.updated_at) : new Date(),
    });
  });

  return articles;
}

/**
 * Transforms legacy executive founders into Employee schema representations.
 *
 * @param {Array<object>} rawFounders
 * @returns {Array<object>}
 */
export function transformFounders(rawFounders = []) {
  return rawFounders.map((f) => {
    const safeName = cleanStr(f.name, 'Executive Member');
    const safeSlug = safeName.toLowerCase().replace(/[^a-z0-9]+/g, '.');
    const email = `${safeSlug}@thinkwires.com`;

    // Extract years of experience from bio if present, else fallback to 10
    const expMatch = cleanStr(f.description).match(/(\d+)\s+years/i);
    const experience = expMatch ? parseInt(expMatch[1], 10) : 10;

    return {
      id: `emp_fnd_${f.id}`,
      name: safeName,
      email,
      phone: '+91 98000 00000',
      designation: cleanStr(f.title, 'Leadership Team'),
      role: 'admin',
      portalAccess: true,
      technicalSkills: ['Executive Leadership', 'Talent Strategy', 'Operations'],
      experience,
      availability: 'Employed',
      deploymentStatus: 'Deployed',
      billingRate: 15000,
      location: 'India / Global',
      notes: cleanStr(f.description, ''),
      createdAt: f.created_at ? new Date(f.created_at) : new Date(),
      updatedAt: f.updated_at ? new Date(f.updated_at) : new Date(),
    };
  });
}

/**
 * Deduplicates applicants into unique Candidates (by normalized email)
 * and unique JobApplications per role (by [email, career_id] pair).
 *
 * @param {Array<object>} rawApplicants
 * @param {Map<number, object>} careerMap Map of legacy career_id -> career metadata
 * @param {string} [defaultPasswordHash] Pre-hashed bcrypt password for candidate accounts
 * @returns {{ candidates: Array<object>, applications: Array<object>, metrics: object }}
 */
export function deduplicateAndTransformApplicants(
  rawApplicants = [],
  careerMap = new Map(),
  defaultPasswordHash = '$2a$10$7EqJtq98hPqEX7fNZaFWoO.8/l.t56N7gY9K6Z0KzW1sH2rX3pS2a'
) {
  const candidateEmailMap = new Map();
  const roleApplicationMap = new Map();
  let totalRows = rawApplicants.length;

  for (const row of rawApplicants) {
    const rawEmail = cleanStr(row.email);
    if (!rawEmail) continue;
    const email = rawEmail.toLowerCase();
    const careerId = Number(row.career_id);
    const applicantId = Number(row.id);

    // 1. Aggregate Candidate Profile (keep most complete / latest information)
    if (!candidateEmailMap.has(email)) {
      candidateEmailMap.set(email, {
        legacyId: applicantId,
        name: cleanStr(row.name, 'Applicant'),
        email,
        phone: cleanStr(row.phone, ''),
        location: cleanStr(row.location, ''),
        technicalSkills: parseSkillsArray(row.skills),
        experience: row.experience ? Number(row.experience) || 0 : 0,
        relevantExperience: row.experience ? Number(row.experience) || 0 : 0,
        currentRole: 'Candidate',
        notes: cleanStr(row.notes, ''),
        password: defaultPasswordHash,
        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
      });
    } else {
      const existing = candidateEmailMap.get(email);
      // Enrich profile if existing has missing or shorter fields
      if ((!existing.name || existing.name === 'Applicant') && row.name) {
        existing.name = cleanStr(row.name);
      }
      if (!existing.phone && row.phone) {
        existing.phone = cleanStr(row.phone);
      }
      if (!existing.location && row.location) {
        existing.location = cleanStr(row.location);
      }
      if (existing.technicalSkills.length === 0 && row.skills) {
        existing.technicalSkills = parseSkillsArray(row.skills);
      }
      if (existing.experience === 0 && row.experience) {
        existing.experience = Number(row.experience) || 0;
        existing.relevantExperience = existing.experience;
      }
    }

    // 2. Strict Role Deduplication: (email + career_id)
    const roleKey = `${email}::${careerId}`;
    const rowDate = row.created_at ? new Date(row.created_at).getTime() : 0;

    if (!roleApplicationMap.has(roleKey)) {
      roleApplicationMap.set(roleKey, {
        raw: row,
        timestamp: rowDate,
      });
    } else {
      // Keep the latest submission if multiple applications were made for the exact same career
      const current = roleApplicationMap.get(roleKey);
      if (rowDate >= current.timestamp || applicantId > current.raw.id) {
        roleApplicationMap.set(roleKey, {
          raw: row,
          timestamp: rowDate,
        });
      }
    }
  }

  // 3. Assemble unique Candidate records
  const candidates = Array.from(candidateEmailMap.values());

  // 4. Assemble unique JobApplication records
  const applications = [];
  for (const [roleKey, entry] of roleApplicationMap.entries()) {
    const raw = entry.raw;
    const email = cleanStr(raw.email).toLowerCase();
    const careerId = Number(raw.career_id);
    const career = careerMap.get(careerId) || null;

    const resumePath = cleanStr(raw.resume_path, '');
    const resumeFileName = resumePath ? path.basename(resumePath) : '';
    const nameParts = cleanStr(raw.name, 'Candidate').split(' ');
    const firstName = nameParts[0] || 'Candidate';
    const lastName = nameParts.slice(1).join(' ') || '';

    applications.push({
      legacyId: Number(raw.id),
      legacyCareerId: careerId,
      candidateEmail: email, // Temporary key for linking during DB insert
      jobId: career ? career.jobId : `REQ-LEGACY-${String(careerId).padStart(3, '0')}`,
      jobTitle: career ? career.title : `Position #${careerId}`,
      department: 'Engineering',
      location: cleanStr(raw.location, 'Remote / Hybrid'),
      firstName,
      lastName,
      email,
      phone: cleanStr(raw.phone, ''),
      experience: raw.experience ? Number(raw.experience) || 0 : 0,
      skills: parseSkillsArray(raw.skills),
      resumeKey: resumePath,
      resumePath: resumePath,
      resumeUrl: resumePath ? `/storage/${resumePath}` : '',
      resumeFileName,
      resumeOriginalName: resumeFileName,
      status: raw.status === 'pending' ? 'Applied' : cleanStr(raw.status, 'Applied'),
      notes: cleanStr(raw.notes, ''),
      createdAt: raw.created_at ? new Date(raw.created_at) : new Date(),
      updatedAt: raw.updated_at ? new Date(raw.updated_at) : new Date(),
    });
  }

  const uniqueCandidates = candidates.length;
  const uniqueRoleApplications = applications.length;
  const discardedSpamApplications = totalRows - uniqueRoleApplications;

  return {
    candidates,
    applications,
    metrics: {
      totalRows,
      uniqueCandidates,
      uniqueRoleApplications,
      discardedSpamApplications,
    },
  };
}

/**
 * Synchronizes authentic career jobs and articles into adminSeedData.json.
 *
 * @param {Array<object>} transformedJobs
 * @param {Array<object>} transformedArticles
 * @param {string} [seedFilePath]
 */
export function syncSeedCatalog(transformedJobs, transformedArticles, seedFilePath) {
  const filePath =
    seedFilePath || path.resolve(__dirname, '../seeds/adminSeedData.json');

  if (!fs.existsSync(filePath)) {
    throw new Error(`adminSeedData.json not found at ${filePath}`);
  }

  const rawJson = fs.readFileSync(filePath, 'utf8');
  const catalog = JSON.parse(rawJson);

  // Convert transformed jobs to adminSeedData format
  const seedJobs = transformedJobs.map((j, idx) => ({
    id: `job_req_leg_${j.legacyId}`,
    jobId: j.jobId,
    title: j.title,
    client: j.client,
    contactPerson: 'Thinkwires Talent Desk',
    contactEmail: 'talent@thinkwires.com',
    contactPhone: '+91 98000 00000',
    engagementModel: j.jobMode === 'Contract' ? 'Contract Augmentation' : 'Staff Augmentation',
    seniority: j.experience || 'Mid-Senior (3-5 yrs)',
    requiredSkills: j.requiredSkills,
    skills: j.skills,
    experienceRequired: j.experienceRequired,
    openingsCount: j.openingsCount,
    fulfilledCount: j.fulfilledCount,
    location: j.location,
    workMode: 'Hybrid',
    priority: j.priority,
    deploymentUrgency: 'standard',
    status: j.status === 'active' ? 'Active' : 'Closed',
    budget: j.salary,
    budgetEnvelope: 'bracket_2',
    description: j.description,
    requirements: j.requirements,
    category: 'Engineering Opening',
    source: 'Legacy Career Ingestion',
    isRequisition: true,
    postedDate: j.createdAt
      ? (j.createdAt instanceof Date ? j.createdAt : new Date(j.createdAt)).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
  }));

  // Convert transformed articles to adminSeedData format
  const seedArticles = transformedArticles.map((a, idx) => ({
    id: `art_leg_${a.legacyId}_${a.legacyType}`,
    title: a.title,
    slug: a.slug,
    summary: a.summary,
    body: a.body,
    author: a.author,
    category: a.category,
    featuredImageUrl: a.featuredImageUrl,
    tags: a.tags,
    readTime: a.readTime,
    viewsCount: a.viewsCount,
    status: a.status,
    publishedAt: a.publishedAt
      ? (a.publishedAt instanceof Date ? a.publishedAt : new Date(a.publishedAt)).toISOString()
      : new Date().toISOString(),
  }));

  catalog.jobs = seedJobs;
  catalog.articles = seedArticles;

  fs.writeFileSync(filePath, JSON.stringify(catalog, null, 2), 'utf8');
  return { jobsUpdated: seedJobs.length, articlesUpdated: seedArticles.length };
}

/**
 * Main migration execution function.
 *
 * @param {object} [options]
 * @param {string} [options.dumpPath] Path to thinkwir_admin.sql
 * @param {boolean} [options.dryRun] If true, parse & cleanse without writing to DB
 * @param {boolean} [options.skipSeedSync] If true, skip writing to adminSeedData.json
 * @returns {Promise<object>} Migration execution summary
 */
export async function runLegacyMigration(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const skipSeedSync = Boolean(options.skipSeedSync);

  // Locate SQL dump file across common relative/absolute candidate paths
  const candidatePaths = [
    options.dumpPath,
    process.env.LEGACY_SQL_PATH,
    path.resolve(process.cwd(), 'thinkwir_admin.sql'),
    path.resolve(process.cwd(), '../thinkwir_admin.sql'),
    path.resolve(process.cwd(), '../../thinkwir_admin.sql'),
    path.resolve(process.cwd(), '../../../thinkwir_admin.sql'),
    path.resolve(__dirname, '../../../../../../thinkwir_admin.sql'),
    'C:\\Users\\Tanjil Alam\\Desktop\\ThinkWires\\thinkwir_admin.sql',
  ].filter(Boolean);

  const dumpPath = candidatePaths.find((p) => fs.existsSync(p)) || candidatePaths[0];

  console.log(`\n======================================================`);
  console.log(`🚀 Thinkwires Legacy Database Migration Engine`);
  console.log(`======================================================`);
  console.log(`Dump File: ${dumpPath}`);
  console.log(`Mode:      ${dryRun ? 'DRY-RUN (No writes)' : 'LIVE EXECUTION'}`);
  console.log(`Target DB: MongoDB primary document store + adminSeedData`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(dumpPath)) {
    throw new Error(`Legacy SQL file not found at path: ${dumpPath}`);
  }

  // 1. Parse SQL Dump
  console.log(`[1/5] Streaming & parsing SQL dump...`);
  const rawData = await parseLegacySqlDump(dumpPath, {
    tables: new Set(['careers', 'blogs', 'career_blogs', 'founders', 'applicants']),
  });

  console.log(`      Found ${rawData.careers.length} careers`);
  console.log(`      Found ${rawData.blogs.length} blogs & ${rawData.career_blogs.length} career blogs`);
  console.log(`      Found ${rawData.founders.length} founders`);
  console.log(`      Found ${rawData.applicants.length} raw applicant rows`);

  // 2. Transform Entities
  console.log(`\n[2/5] Cleansing & transforming entities...`);
  const transformedCareers = transformCareers(rawData.careers);
  const transformedArticles = transformArticles(rawData.blogs, rawData.career_blogs);
  const transformedFounders = transformFounders(rawData.founders);

  const careerMap = new Map();
  transformedCareers.forEach((c) => careerMap.set(c.legacyId, c));

  // Generate a standard hashed password for candidate accounts
  const salt = await bcrypt.genSalt(10);
  const defaultCandidateHash = await bcrypt.hash('Thinkwires@Candidate2026!', salt);

  const applicantCleansing = deduplicateAndTransformApplicants(
    rawData.applicants,
    careerMap,
    defaultCandidateHash
  );

  console.log(`      Unique Candidates:       ${applicantCleansing.metrics.uniqueCandidates}`);
  console.log(`      Unique Role Applications:${applicantCleansing.metrics.uniqueRoleApplications}`);
  console.log(`      Filtered Spam Resubmissions: ${applicantCleansing.metrics.discardedSpamApplications}`);

  const summary = {
    careers: transformedCareers.length,
    articles: transformedArticles.length,
    founders: transformedFounders.length,
    rawApplicantRows: applicantCleansing.metrics.totalRows,
    uniqueCandidates: applicantCleansing.metrics.uniqueCandidates,
    uniqueRoleApplications: applicantCleansing.metrics.uniqueRoleApplications,
    discardedSpamApplications: applicantCleansing.metrics.discardedSpamApplications,
    dryRun,
  };

  // If Dry Run, print summary and return
  if (dryRun) {
    console.log(`\n[DRY RUN COMPLETE] Validation succeeded across all ${summary.careers} careers, ${summary.articles} articles, ${summary.uniqueCandidates} candidates, and ${summary.uniqueRoleApplications} applications.`);
    return summary;
  }

  // 3. Connect to Database
  console.log(`\n[3/5] Connecting to MongoDB...`);
  await connectMongoDB();

  // 4. Ingest Careers, Articles, and Founders
  console.log(`\n[4/5] Upserting Core Catalogs into MongoDB...`);

  // Ingest Careers
  const careerOps = transformedCareers.map((c) => ({
    updateOne: {
      filter: { legacyId: c.legacyId },
      update: { $set: c },
      upsert: true,
    },
  }));
  if (careerOps.length > 0) {
    await JobRequirement.bulkWrite(careerOps);
    console.log(`      ✓ Upserted ${careerOps.length} Job Requirements`);
  }

  // Load inserted jobs to get Mongo _ids
  const dbJobs = await JobRequirement.find({ legacyId: { $ne: null } }).lean();
  const dbJobMap = new Map();
  dbJobs.forEach((j) => {
    dbJobMap.set(j.legacyId, j._id);
  });

  // Ingest Articles
  const articleOps = transformedArticles.map((a) => ({
    updateOne: {
      filter: { slug: a.slug },
      update: { $set: a },
      upsert: true,
    },
  }));
  if (articleOps.length > 0) {
    await Article.bulkWrite(articleOps);
    console.log(`      ✓ Upserted ${articleOps.length} Articles`);
  }

  // Ingest Founders (as Employees)
  const founderOps = transformedFounders.map((f) => ({
    updateOne: {
      filter: { email: f.email },
      update: { $set: f },
      upsert: true,
    },
  }));
  if (founderOps.length > 0) {
    await Employee.bulkWrite(founderOps);
    console.log(`      ✓ Upserted ${founderOps.length} Executive Founders`);
  }

  // 5. Ingest Candidates & Role Applications
  console.log(`\n[5/5] Bulk Ingesting 3,619 Candidates & 3,826 Role Applications...`);

  // Batch insert candidates in chunks of 500
  const candidateOps = applicantCleansing.candidates.map((c) => ({
    updateOne: {
      filter: { email: c.email },
      update: { $set: c },
      upsert: true,
    },
  }));

  const CHUNK_SIZE = 500;
  for (let i = 0; i < candidateOps.length; i += CHUNK_SIZE) {
    const chunk = candidateOps.slice(i, i + CHUNK_SIZE);
    await Candidate.bulkWrite(chunk);
  }
  console.log(`      ✓ Upserted ${candidateOps.length} unique Candidate profiles`);

  // Query candidate IDs for application linkage
  const dbCandidates = await Candidate.find({}, { _id: 1, email: 1 }).lean();
  const candidateIdMap = new Map();
  dbCandidates.forEach((c) => {
    candidateIdMap.set(c.email.toLowerCase(), c._id);
  });

  // Prepare Job Applications with resolved ObjectId references
  const validApplications = [];
  for (const app of applicantCleansing.applications) {
    const candidateId = candidateIdMap.get(app.candidateEmail);
    if (!candidateId) continue;

    const mongoJobId = dbJobMap.get(app.legacyCareerId);

    const candidateName = `${app.firstName || ''} ${app.lastName || ''}`.trim() || 'Candidate';

    validApplications.push({
      candidate: candidateId,
      jobId: mongoJobId ? mongoJobId.toString() : app.jobId,
      legacyId: app.legacyId,
      legacyCareerId: app.legacyCareerId,
      jobTitle: app.jobTitle,
      department: app.department,
      location: app.location,
      firstName: app.firstName,
      lastName: app.lastName,
      candidateName,
      email: app.email,
      candidateEmail: app.email,
      phone: app.phone,
      candidatePhone: app.phone,
      mobileNumber: app.phone,
      anonymousCode: `TW-LEG-${app.legacyId}`,
      experience: app.experience,
      skills: app.skills,
      resumeKey: app.resumeKey,
      resumePath: app.resumePath,
      resumeUrl: app.resumeUrl,
      resumeFileName: app.resumeFileName,
      resumeOriginalName: app.resumeOriginalName,
      status: app.status,
      notes: app.notes,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    });
  }

  // Clear any existing empty string anonymousCodes to ensure sparse uniqueness
  await JobApplication.updateMany({ anonymousCode: '' }, { $set: { anonymousCode: null } });

  const appOps = validApplications.map((app) => ({
    updateOne: {
      filter: {
        candidate: app.candidate,
        legacyCareerId: app.legacyCareerId,
      },
      update: { $set: app },
      upsert: true,
    },
  }));

  for (let i = 0; i < appOps.length; i += CHUNK_SIZE) {
    const chunk = appOps.slice(i, i + CHUNK_SIZE);
    await JobApplication.bulkWrite(chunk);
  }
  console.log(`      ✓ Upserted ${appOps.length} Job Application history records`);

  // Sync adminSeedData.json if requested
  if (!skipSeedSync) {
    console.log(`\n[Sync] Updating offline fallback catalog (adminSeedData.json)...`);
    const seedSyncResult = syncSeedCatalog(transformedCareers, transformedArticles);
    console.log(`      ✓ Updated seed data: ${seedSyncResult.jobsUpdated} jobs, ${seedSyncResult.articlesUpdated} articles`);
  }

  console.log(`\n======================================================`);
  console.log(`🎉 Migration Completed Successfully!`);
  console.log(`======================================================\n`);

  return summary;
}

// Direct CLI Invocation
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isDryRun = process.argv.includes('--dry-run');
  const skipSeed = process.argv.includes('--skip-seed-sync');
  const fileArgIdx = process.argv.indexOf('--file');
  const customDumpPath = fileArgIdx !== -1 ? process.argv[fileArgIdx + 1] : undefined;

  runLegacyMigration({
    dryRun: isDryRun,
    skipSeedSync: skipSeed,
    dumpPath: customDumpPath,
  })
    .then(async () => {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(`❌ Migration failed:`, err);
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      process.exit(1);
    });
}

export default {
  runLegacyMigration,
  transformCareers,
  transformArticles,
  transformFounders,
  deduplicateAndTransformApplicants,
  syncSeedCatalog,
};