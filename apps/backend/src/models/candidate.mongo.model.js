import mongoose from 'mongoose';
import {
  fieldEncryptionPlugin,
  hashSearchableField,
} from '../utils/fieldEncryption.util.js';

const candidateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Candidate name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Candidate email is required'],
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    currentRole: {
      type: String,
      default: 'Software Engineer',
    },
    jobId: {
      type: String,
      default: '',
      trim: true,
    },
    jobTitle: {
      type: String,
      default: '',
      trim: true,
    },
    positionApplied: {
      type: String,
      default: '',
      trim: true,
    },
    headline: {
      type: String,
      default: '',
    },
    location: {
      type: String,
      default: '',
    },
    technicalSkills: {
      type: [String],
      default: [],
    },
    experience: {
      type: Number,
      default: 0,
      min: 0,
    },
    relevantExperience: {
      type: Number,
      default: 0,
      min: 0,
    },
    expectedSalary: {
      type: String,
      default: 'Market Standard',
    },
    currentCTC: {
      type: String,
      default: '',
    },
    preferredLocation: {
      type: String,
      default: '',
    },
    currentCompany: {
      type: String,
      default: '',
    },
    client: {
      type: String,
      default: '',
    },
    rateCard: {
      type: String,
      default: '',
    },
    applicationDate: {
      type: String,
      default: () => new Date().toISOString().split('T')[0],
    },
    month: {
      type: String,
      default: () =>
        new Date().toLocaleString('default', {
          month: 'long',
          year: 'numeric',
        }),
    },
    resumeUrl: {
      type: String,
      default: '',
    },
    resumeKey: {
      type: String,
      default: '',
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    avatarType: {
      type: String,
      enum: ['upload', 'preset', 'monogram', 'initials'],
      default: 'initials',
    },
    benchAvatarCode: {
      type: String,
      default: 'TW',
    },
    portfolioUrl: {
      type: String,
      default: '',
    },
    githubUrl: {
      type: String,
      default: '',
    },
    linkedinUrl: {
      type: String,
      default: '',
    },
    bio: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: [
        'Applied',
        'Screening',
        'Interview',
        'Offered',
        'Hired',
        'Rejected',
        'Withdrawn',
      ],
      default: 'Applied',
    },
    workMode: {
      type: String,
      enum: ['Full-Time Looking', 'Freelancer', 'On-Bench'],
      default: 'Full-Time Looking',
    },
    noticePeriod: {
      type: String,
      default: '30 Days',
    },
    assessmentScore: {
      type: Number,
      default: null,
    },
    fitScore: {
      type: Number,
      default: null,
    },
    vettingScore: {
      type: Number,
      default: 85,
    },
    resetPasswordToken: {
      type: String,
      default: null,
      select: false,
    },
    resetPasswordExpire: {
      type: Date,
      default: null,
      select: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    tokenVersion: {
      type: Number,
      default: 0,
      required: true,
    },
    passwordChangedAt: {
      type: Date,
      default: Date.now,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    // Sensitive Restricted PII Fields (Field-Level Encrypted with AES-256-GCM)
    governmentId: {
      type: String,
      default: null,
      select: false,
    },
    governmentIdHash: {
      type: String,
      default: null,
      select: false,
      index: true,
      sparse: true,
    },
    bankDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
    },
    sensitiveNotes: {
      type: String,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

// Invalidate tokens upon password change (Issue #197)
candidateSchema.pre('save', function (next) {
  if (this.isModified('password')) {
    this.tokenVersion = (this.tokenVersion || 0) + 1;
    this.passwordChangedAt = new Date();
  }
  if (this.isModified('governmentId') && this.governmentId) {
    this.governmentIdHash = hashSearchableField(this.governmentId);
  }
  next();
});

// Sensitive field encryption plugin (AES-256-GCM)
candidateSchema.plugin(fieldEncryptionPlugin, {
  fields: ['governmentId', 'sensitiveNotes'],
});

// Partial unique index for active candidates to avoid collisions with soft-deleted profiles (Issue #210)
// Uses equality expression { isDeleted: false } as MongoDB partialFilterExpression does not support $ne / $not
candidateSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  }
);
candidateSchema.index({ resetPasswordToken: 1 }, { sparse: true });
candidateSchema.index({ status: 1, createdAt: -1 });
candidateSchema.index({ jobId: 1, createdAt: -1 });
candidateSchema.index({ createdAt: -1 });
candidateSchema.index({ resumeUrl: 1 });
candidateSchema.index({ resumeKey: 1 });
candidateSchema.index(
  {
    name: 'text',
    currentRole: 'text',
    technicalSkills: 'text',
    positionApplied: 'text',
  },
  { name: 'idx_candidate_text_search' }
);

// Prevent re-compilation in development
const Candidate =
  mongoose.models.Candidate || mongoose.model('Candidate', candidateSchema);

export default Candidate;
