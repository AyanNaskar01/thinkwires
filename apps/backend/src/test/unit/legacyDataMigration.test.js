import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  parseSqlTuple,
  parseInsertHeader,
  parseLegacySqlDump,
} from '../../migrations/legacySqlParser.js';
import {
  parseSkillsArray,
  generateSlug,
  transformCareers,
  transformArticles,
  transformFounders,
  deduplicateAndTransformApplicants,
  syncSeedCatalog,
  runLegacyMigration,
} from '../../migrations/legacyDataMigrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootSqlDumpPath = path.resolve(__dirname, '../../../../../../thinkwir_admin.sql');

describe('Legacy Database Migration Suite', () => {
  describe('SQL Low-Level Parser', () => {
    it('should parse single and multi-value SQL tuples correctly', () => {
      const tuple = "(1, 'AI Engineer & Researcher', NULL, 12.5, '2026-01-01 10:00:00', 'He said \\'Hello\\' to all')";
      const parsed = parseSqlTuple(tuple);

      expect(parsed).toEqual([
        1,
        'AI Engineer & Researcher',
        null,
        12.5,
        '2026-01-01 10:00:00',
        "He said 'Hello' to all",
      ]);
    });

    it('should extract table name and column list from INSERT header', () => {
      const header = "INSERT INTO `careers` (`id`, `title`, `slug`, `skills`, `created_at`) VALUES";
      const result = parseInsertHeader(header);

      expect(result).not.toBeNull();
      expect(result.table).toBe('careers');
      expect(result.columns).toEqual(['id', 'title', 'slug', 'skills', 'created_at']);
    });

    it('should return null for non-insert lines', () => {
      expect(parseInsertHeader('-- Table structure for table `careers`')).toBeNull();
      expect(parseInsertHeader('LOCK TABLES `careers` WRITE;')).toBeNull();
    });
  });

  describe('Entity Transformations', () => {
    it('should parse skills string separated by commas, semicolons, and bullets', () => {
      const raw = 'React, Node.js; TypeScript • Python \n Docker';
      const skills = parseSkillsArray(raw);
      expect(skills).toEqual(['React', 'Node.js', 'TypeScript', 'Python', 'Docker']);
    });

    it('should transform careers into JobRequirement schema representations', () => {
      const rawCareers = [
        {
          id: 101,
          title: 'Staff Platform Architect',
          slug: 'staff-platform-architect',
          skills: 'Kubernetes, AWS, Terraform',
          experience: '7',
          location: 'Bangalore, India',
          type: 'contract',
          salary_range: '35LPA',
          status: 'open',
          description: 'Design cloud native infrastructure',
          requirements: 'Deep knowledge of distributed systems',
          created_at: '2026-01-10 12:00:00',
          updated_at: '2026-01-10 12:00:00',
        },
      ];

      const transformed = transformCareers(rawCareers);
      expect(transformed).toHaveLength(1);
      const job = transformed[0];

      expect(job.legacyId).toBe(101);
      expect(job.jobId).toBe('REQ-LEGACY-101');
      expect(job.title).toBe('Staff Platform Architect');
      expect(job.client).toBe('Thinkwires Enterprise');
      expect(job.jobMode).toBe('Contract');
      expect(job.status).toBe('active');
      expect(job.requiredSkills).toEqual(['Kubernetes', 'AWS', 'Terraform']);
      expect(job.experienceRequired).toBe(7);
      expect(job.salary).toBe('35LPA');
    });

    it('should transform blogs and career_blogs with distinct categories and prevent slug collision', () => {
      const rawBlogs = [
        {
          id: 1,
          title: 'Scaling Modern Teams',
          slug: 'scaling-modern-teams',
          content: '<p>Content for general blog</p>',
          excerpt: 'Short excerpt',
          featured_image: 'blogs/test.jpg',
          status: 'published',
          created_at: '2026-02-01 10:00:00',
          updated_at: '2026-02-01 10:00:00',
        },
      ];

      const rawCareerBlogs = [
        {
          id: 2,
          title: 'Interview Masterclass',
          slug: 'scaling-modern-teams', // Intentional collision
          content: '<p>Career interview tips</p>',
          excerpt: 'Career guidance excerpt',
          featured_image: null,
          status: 'published',
          created_at: '2026-02-05 10:00:00',
          updated_at: '2026-02-05 10:00:00',
        },
      ];

      const articles = transformArticles(rawBlogs, rawCareerBlogs);
      expect(articles).toHaveLength(2);

      const blog = articles.find((a) => a.legacyType === 'blog');
      const careerBlog = articles.find((a) => a.legacyType === 'career_blog');

      expect(blog.category).toBe('Talent Engineering');
      expect(blog.slug).toBe('scaling-modern-teams');

      expect(careerBlog.category).toBe('Career Guidance');
      expect(careerBlog.slug).toBe('career-2-scaling-modern-teams');
    });

    it('should transform executive founders into Employee records', () => {
      const rawFounders = [
        {
          id: 1,
          name: 'Naziya Husain',
          title: 'Founder Member',
          description: 'With over 14 years of hands-on experience in talent acquisition and operations...',
          created_at: '2025-11-28 15:32:45',
          updated_at: '2026-05-06 01:42:53',
        },
      ];

      const founders = transformFounders(rawFounders);
      expect(founders).toHaveLength(1);
      const f = founders[0];

      expect(f.id).toBe('emp_fnd_1');
      expect(f.name).toBe('Naziya Husain');
      expect(f.email).toBe('naziya.husain@thinkwires.com');
      expect(f.designation).toBe('Founder Member');
      expect(f.role).toBe('admin');
      expect(f.experience).toBe(14);
      expect(f.deploymentStatus).toBe('Deployed');
    });
  });

  describe('Deduplication & Cleansing Logic', () => {
    it('should deduplicate candidates by email and applications per role', () => {
      const careerMap = new Map([
        [10, { jobId: 'REQ-LEGACY-010', title: 'Senior Backend Engineer' }],
        [20, { jobId: 'REQ-LEGACY-020', title: 'Staff Frontend Engineer' }],
      ]);

      const rawApplicants = [
        // Candidate 1 applies 3 times to career 10 (spam resubmissions)
        {
          id: 1,
          career_id: 10,
          name: 'Alice Cooper',
          email: 'alice@example.com',
          phone: '9876543210',
          skills: 'Java, Spring Boot',
          experience: 5,
          resume_path: 'resumes/alice_v1.pdf',
          created_at: '2026-01-01 10:00:00',
        },
        {
          id: 2,
          career_id: 10,
          name: 'Alice Cooper',
          email: 'alice@example.com',
          phone: '9876543210',
          skills: 'Java, Spring Boot, AWS',
          experience: 5,
          resume_path: 'resumes/alice_v2.pdf',
          created_at: '2026-01-02 10:00:00',
        },
        {
          id: 3,
          career_id: 10,
          name: 'Alice Cooper',
          email: 'ALICE@EXAMPLE.COM', // Uppercase variation
          phone: '9876543210',
          skills: 'Java, Spring Boot, AWS, Kafka',
          experience: 6,
          resume_path: 'resumes/alice_latest.pdf',
          created_at: '2026-01-03 10:00:00',
        },
        // Candidate 1 also legitimately applies to career 20
        {
          id: 4,
          career_id: 20,
          name: 'Alice Cooper',
          email: 'alice@example.com',
          phone: '9876543210',
          skills: 'React, TypeScript',
          experience: 6,
          resume_path: 'resumes/alice_frontend.pdf',
          created_at: '2026-01-04 10:00:00',
        },
        // Candidate 2 applies once to career 10
        {
          id: 5,
          career_id: 10,
          name: 'Bob Marley',
          email: 'bob@example.com',
          phone: '9123456789',
          skills: 'Go, Docker',
          experience: 4,
          resume_path: 'resumes/bob.pdf',
          created_at: '2026-01-02 15:00:00',
        },
      ];

      const result = deduplicateAndTransformApplicants(rawApplicants, careerMap);

      expect(result.metrics.totalRows).toBe(5);
      // Alice and Bob -> exactly 2 unique candidates
      expect(result.metrics.uniqueCandidates).toBe(2);
      expect(result.candidates).toHaveLength(2);

      // Unique role applications:
      // Alice -> role 10 (latest id: 3)
      // Alice -> role 20 (id: 4)
      // Bob -> role 10 (id: 5)
      // Total = 3 applications!
      expect(result.metrics.uniqueRoleApplications).toBe(3);
      expect(result.metrics.discardedSpamApplications).toBe(2);
      expect(result.applications).toHaveLength(3);

      const aliceRole10 = result.applications.find(
        (a) => a.email === 'alice@example.com' && a.legacyCareerId === 10
      );
      expect(aliceRole10).toBeDefined();
      expect(aliceRole10.resumeKey).toBe('resumes/alice_latest.pdf');
      expect(aliceRole10.jobTitle).toBe('Senior Backend Engineer');

      const aliceRole20 = result.applications.find(
        (a) => a.email === 'alice@example.com' && a.legacyCareerId === 20
      );
      expect(aliceRole20).toBeDefined();
      expect(aliceRole20.jobTitle).toBe('Staff Frontend Engineer');
    });
  });

  describe('Full Dump Verification (Dry Run)', () => {
    it('should correctly process the authentic SQL dump with exact target metrics', async () => {
      if (!fs.existsSync(rootSqlDumpPath)) {
        console.warn(`Skipping authentic dump test: ${rootSqlDumpPath} not found`);
        return;
      }

      const summary = await runLegacyMigration({
        dumpPath: rootSqlDumpPath,
        dryRun: true,
      });

      expect(summary.careers).toBe(84);
      expect(summary.articles).toBe(23); // 17 blogs + 6 career_blogs
      expect(summary.founders).toBe(5);
      expect(summary.rawApplicantRows).toBe(12181);
      expect(summary.uniqueCandidates).toBe(3619);
      expect(summary.uniqueRoleApplications).toBe(3826);
      expect(summary.discardedSpamApplications).toBe(8355);
    }, 60000); // 60s timeout for streaming 3.3MB SQL
  });
});