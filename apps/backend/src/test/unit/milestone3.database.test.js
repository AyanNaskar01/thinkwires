import { describe, it, expect, vi } from 'vitest';
import { parsePagination } from '../../utils/pagination.util.js';
import JobRequirement from '../../models/job.mongo.model.js';
import Candidate from '../../models/candidate.mongo.model.js';
import JobApplication from '../../models/jobApplication.mongo.model.js';
import Client from '../../models/client.mongo.model.js';
import Placement from '../../models/placement.mongo.model.js';
import Employee from '../../models/employee.mongo.model.js';
import Article from '../../models/article.mongo.model.js';
import Page from '../../models/page.mongo.model.js';
import Media from '../../models/media.mongo.model.js';
import Announcement from '../../models/announcement.mongo.model.js';
import * as esrMigration from '../../migrations/scripts/002_create_esr_and_text_indexes.js';
import * as pgUserMigration from '../../migrations/pg_scripts/001_create_users_table.js';

describe('Milestone 3: Database Query Hygiene, ESR Indexing & Migrations', () => {
  describe('SEC-DB-01: Pagination & Query Boundary Utilities', () => {
    it('enforces default limit of 50 and page 1 when query is empty', () => {
      const result = parsePagination({});
      expect(result).toEqual({ page: 1, limit: 50, skip: 0 });
    });

    it('enforces hard maximum limit of 100 to prevent heap exhaustion', () => {
      const result = parsePagination({ limit: 500, page: 2 });
      expect(result).toEqual({ page: 2, limit: 100, skip: 100 });
    });

    it('handles negative or NaN values safely with bounds clamping', () => {
      const result = parsePagination({ limit: -10, page: -5 });
      expect(result).toEqual({ page: 1, limit: 1, skip: 0 });

      const nanResult = parsePagination({ limit: 'invalid', page: 'abc' });
      expect(nanResult).toEqual({ page: 1, limit: 50, skip: 0 });
    });

    it('calculates correct skip offsets across various page indices', () => {
      expect(parsePagination({ page: 3, limit: 25 })).toEqual({
        page: 3,
        limit: 25,
        skip: 50,
      });
      expect(parsePagination({ page: 5, limit: 10 })).toEqual({
        page: 5,
        limit: 10,
        skip: 40,
      });
    });
  });

  describe('SEC-DB-02 & SEC-DB-05: Compound ESR and Full-Text Search Indexes', () => {
    it('defines Equality-Sort-Range (ESR) and full-text indexes on JobRequirement schema', () => {
      const indexes = JobRequirement.schema.indexes();
      const hasEsrOpenings = indexes.some(
        ([fields]) =>
          fields.isRequisition === 1 &&
          fields.createdAt === -1 &&
          fields.status === 1
      );
      const hasEsrRequisitions = indexes.some(
        ([fields]) =>
          fields.isRequisition === 1 &&
          fields.status === 1 &&
          fields.createdAt === -1
      );
      const hasTextIndex = indexes.some(
        ([fields]) =>
          fields.title === 'text' &&
          fields.description === 'text' &&
          fields.requirements === 'text'
      );

      expect(hasEsrOpenings).toBe(true);
      expect(hasEsrRequisitions).toBe(true);
      expect(hasTextIndex).toBe(true);
    });

    it('defines ESR and text search indexes on Candidate schema', () => {
      const indexes = Candidate.schema.indexes();
      const hasJobDateEsr = indexes.some(
        ([fields]) => fields.jobId === 1 && fields.createdAt === -1
      );
      const hasStatusDateEsr = indexes.some(
        ([fields]) => fields.status === 1 && fields.createdAt === -1
      );
      const hasTextIndex = indexes.some(
        ([fields]) =>
          fields.name === 'text' &&
          fields.currentRole === 'text' &&
          fields.technicalSkills === 'text'
      );

      expect(hasJobDateEsr).toBe(true);
      expect(hasStatusDateEsr).toBe(true);
      expect(hasTextIndex).toBe(true);
    });

    it('defines compound ESR indexes on JobApplication schema', () => {
      const indexes = JobApplication.schema.indexes();
      const hasJobStatusDate = indexes.some(
        ([fields]) =>
          fields.jobId === 1 && fields.status === 1 && fields.createdAt === -1
      );
      const hasStatusDate = indexes.some(
        ([fields]) => fields.status === 1 && fields.createdAt === -1
      );
      const hasCandidateDate = indexes.some(
        ([fields]) => fields.candidate === 1 && fields.createdAt === -1
      );

      expect(hasJobStatusDate).toBe(true);
      expect(hasStatusDate).toBe(true);
      expect(hasCandidateDate).toBe(true);
    });

    it('defines compound ESR indexes on Client schema', () => {
      const indexes = Client.schema.indexes();
      const hasStatusDate = indexes.some(
        ([fields]) => fields.status === 1 && fields.createdAt === -1
      );
      expect(hasStatusDate).toBe(true);
    });

    it('defines compound ESR indexes on Placement schema', () => {
      const indexes = Placement.schema.indexes();
      const hasStatusDate = indexes.some(
        ([fields]) => fields.assignmentStatus === 1 && fields.createdAt === -1
      );
      const hasClientDate = indexes.some(
        ([fields]) => fields.clientName === 1 && fields.createdAt === -1
      );
      expect(hasStatusDate).toBe(true);
      expect(hasClientDate).toBe(true);
    });

    it('defines compound ESR indexes on Employee schema', () => {
      const indexes = Employee.schema.indexes();
      const hasDeploymentDate = indexes.some(
        ([fields]) => fields.deploymentStatus === 1 && fields.createdAt === -1
      );
      expect(hasDeploymentDate).toBe(true);
    });

    it('defines compound ESR indexes on Article schema', () => {
      const indexes = Article.schema.indexes();
      const hasCategoryStatusDate = indexes.some(
        ([fields]) =>
          fields.category === 1 && fields.status === 1 && fields.createdAt === -1
      );
      expect(hasCategoryStatusDate).toBe(true);
    });
  });

  describe('SEC-DB-04: Schema Hygiene & Soft-Delete Auditing', () => {
    const modelsWithSoftDelete = [
      { name: 'JobRequirement', model: JobRequirement },
      { name: 'Candidate', model: Candidate },
      { name: 'JobApplication', model: JobApplication },
      { name: 'Client', model: Client },
      { name: 'Placement', model: Placement },
      { name: 'Employee', model: Employee },
      { name: 'Article', model: Article },
      { name: 'Page', model: Page },
      { name: 'Media', model: Media },
      { name: 'Announcement', model: Announcement },
    ];

    modelsWithSoftDelete.forEach(({ name, model }) => {
      it(`enforces timestamps and soft-delete fields on ${name} schema`, () => {
        const schema = model.schema;
        expect(schema.options.timestamps).toBe(true);

        const isDeletedPath = schema.path('isDeleted');
        expect(isDeletedPath).toBeDefined();
        expect(isDeletedPath.instance).toBe('Boolean');
        expect(isDeletedPath.defaultValue).toBe(false);

        const deletedAtPath = schema.path('deletedAt');
        expect(deletedAtPath).toBeDefined();
        expect(deletedAtPath.instance).toBe('Date');
        expect(deletedAtPath.defaultValue).toBe(null);
      });
    });
  });

  describe('SEC-DB-03: PostgreSQL Relational Migration Scripts', () => {
    it('executes up and down migrations with valid DDL SQL queries', async () => {
      const queryMock = vi.fn().mockResolvedValue([[]]);
      const mockSequelize = { query: queryMock };

      await pgUserMigration.up({ sequelize: mockSequelize });
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS users')
      );
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_users_email')
      );

      await pgUserMigration.down({ sequelize: mockSequelize });
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('DROP TABLE IF EXISTS users CASCADE')
      );
    });

    it('executes MongoDB ESR & text index migration script without throwing', async () => {
      const createIndexMock = vi.fn().mockResolvedValue('ok');
      const mockDb = {
        collection: vi.fn().mockReturnValue({
          createIndex: createIndexMock,
        }),
      };

      await esrMigration.up({ db: mockDb });
      expect(mockDb.collection).toHaveBeenCalledWith('jobrequirements');
      expect(mockDb.collection).toHaveBeenCalledWith('candidates');
      expect(mockDb.collection).toHaveBeenCalledWith('jobapplications');
      expect(mockDb.collection).toHaveBeenCalledWith('clients');
      expect(mockDb.collection).toHaveBeenCalledWith('placements');
      expect(createIndexMock).toHaveBeenCalled();
    });
  });
});
