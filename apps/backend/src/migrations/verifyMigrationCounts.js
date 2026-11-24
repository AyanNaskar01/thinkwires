import { connectMongoDB } from '../configs/mongodb.js';
import Job from '../models/job.mongo.model.js';
import Article from '../models/article.mongo.model.js';
import Employee from '../models/employee.mongo.model.js';
import Candidate from '../models/candidate.mongo.model.js';
import JobApp from '../models/jobApplication.mongo.model.js';
import mongoose from 'mongoose';

async function verifyCounts() {
  await connectMongoDB();
  const legacyJobs = await Job.countDocuments({ legacyId: { $ne: null } });
  const legacyArticles = await Article.countDocuments({ legacyId: { $ne: null } });
  const founders = await Employee.countDocuments({ id: { $regex: '^emp_fnd_' } });
  const totalCandidates = await Candidate.countDocuments({});
  const legacyApplications = await JobApp.countDocuments({ legacyCareerId: { $ne: null } });
  const User = (await import('../models/user.mongo.model.js')).default;
  const adminUser = await User.findOne({ email: 'superadmin@thinkwires.com' });
  const sampleJobs = await Job.find({ legacyId: { $ne: null } }).select('status isRequisition').lean();
  const publicMatchingJobs = await Job.countDocuments({
    isRequisition: false,
    status: { $in: ['Active', 'Approved', 'Published'] },
    isDeleted: { $ne: true },
  });

  console.log('=== LIVE MONGODB VALIDATION SUMMARY ===');
  console.log(`Legacy Jobs Ingested:        ${legacyJobs}`);
  console.log(`Legacy Articles Ingested:    ${legacyArticles}`);
  console.log(`Executive Founders Ingested: ${founders}`);
  console.log(`Total Candidates Ingested:   ${totalCandidates}`);
  console.log(`Unique Role Applications:    ${legacyApplications}`);
  console.log(`Superadmin Account in Mongo: ${adminUser ? `${adminUser.email} (Role: ${adminUser.role}, Active: ${adminUser.isActive})` : 'NOT FOUND'}`);
  console.log(`Distinct Statuses:           ${JSON.stringify([...new Set(sampleJobs.map(j => j.status))])}`);
  console.log(`Distinct isRequisition:      ${JSON.stringify([...new Set(sampleJobs.map(j => j.isRequisition))])}`);
  console.log(`Matching Public /openings:   ${publicMatchingJobs}`);
  console.log('=======================================');

  await mongoose.disconnect();
  process.exit(0);
}

verifyCounts().catch((err) => {
  console.error(err);
  process.exit(1);
});