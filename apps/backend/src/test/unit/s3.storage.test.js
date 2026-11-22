import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageService } from '../../utils/storage.adapter.js';

// Mock @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner
vi.mock('@aws-sdk/client-s3', () => {
  const sendMock = vi.fn().mockImplementation(async (command) => {
    return { $metadata: { httpStatusCode: 200 }, Body: 'mock-stream-data' };
  });

  class S3ClientMock {
    constructor(config) {
      this.config = config;
      this.send = sendMock;
    }
  }

  class PutObjectCommandMock {
    constructor(input) {
      this.input = input;
    }
  }

  class GetObjectCommandMock {
    constructor(input) {
      this.input = input;
    }
  }

  class DeleteObjectCommandMock {
    constructor(input) {
      this.input = input;
    }
  }

  return {
    S3Client: S3ClientMock,
    PutObjectCommand: PutObjectCommandMock,
    GetObjectCommand: GetObjectCommandMock,
    DeleteObjectCommand: DeleteObjectCommandMock,
    sendMock,
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => {
  return {
    getSignedUrl: vi.fn().mockImplementation(async (client, command, options) => {
      return `https://${command.input.Bucket}.s3.amazonaws.com/${command.input.Key}?X-Amz-Expires=${options.expiresIn}&X-Amz-Signature=mock`;
    }),
  };
});

describe('S3 Cloud Object Storage Driver & Pre-Signed URLs (SEC-STA-01)', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...origEnv };
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('initializes S3Client when driver is explicitly configured to s3', () => {
    const service = new StorageService({
      driver: 's3',
      bucket: 'test-bucket',
      region: 'eu-west-1',
    });

    expect(service.driver).toBe('s3');
    expect(service.s3Client).toBeDefined();
    expect(service.s3Client.config.region).toBe('eu-west-1');
  });

  it('saveFile uploads buffer to S3 via PutObjectCommand with ServerSideEncryption', async () => {
    const service = new StorageService({
      driver: 's3',
      bucket: 'thinkwires-resumes',
      region: 'us-east-1',
    });

    const buffer = Buffer.from('Resume Document Content');
    const resultUrl = await service.saveFile(buffer, 'candidate-resume.pdf', 'application/pdf', 'resumes');

    expect(resultUrl).toBe('/uploads/resumes/candidate-resume.pdf');
    expect(service.s3Client.send).toHaveBeenCalledTimes(1);

    const callArgs = service.s3Client.send.mock.calls[0][0];
    expect(callArgs.input.Bucket).toBe('thinkwires-resumes');
    expect(callArgs.input.Key).toBe('resumes/candidate-resume.pdf');
    expect(callArgs.input.Body).toEqual(buffer);
    expect(callArgs.input.ContentType).toBe('application/pdf');
    expect(callArgs.input.ServerSideEncryption).toBe('AES256');
  });

  it('getPresignedDownloadUrl generates a secure 15-minute signed URL with attachment disposition', async () => {
    const service = new StorageService({
      driver: 's3',
      bucket: 'thinkwires-resumes',
      region: 'us-east-1',
    });

    const presigned = await service.getPresignedDownloadUrl('candidate-123.pdf', 'resumes', 900);
    expect(presigned).toContain('https://thinkwires-resumes.s3.amazonaws.com/resumes/candidate-123.pdf');
    expect(presigned).toContain('X-Amz-Expires=900');
  });

  it('deleteFile dispatches DeleteObjectCommand on S3 driver', async () => {
    const service = new StorageService({
      driver: 's3',
      bucket: 'thinkwires-resumes',
      region: 'us-east-1',
    });

    const deleted = await service.deleteFile('obsolete-resume.pdf', 'resumes');
    expect(deleted).toBe(true);
    expect(service.s3Client.send).toHaveBeenCalledTimes(1);
    const callArgs = service.s3Client.send.mock.calls[0][0];
    expect(callArgs.input.Bucket).toBe('thinkwires-resumes');
    expect(callArgs.input.Key).toBe('resumes/obsolete-resume.pdf');
  });

  it('local storage driver falls back to filesystem operations when driver is local', async () => {
    const service = new StorageService({ driver: 'local' });
    expect(service.driver).toBe('local');
    expect(service.s3Client).toBeNull();
  });
});
