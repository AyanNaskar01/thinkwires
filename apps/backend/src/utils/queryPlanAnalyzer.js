/**
 * MongoDB Query-Plan Analyzer & Explain Utility
 * 
 * Provides automated execution-plan inspection using MongoDB explain('executionStats').
 * Analyzes query performance, validates index usage (IXSCAN vs COLLSCAN), checks
 * document-to-returned efficiency ratios, and emits actionable warnings.
 */

/**
 * Traverses an execution stats tree recursively to find all occurrences of a stage name
 * or key characteristics (e.g. IXSCAN, COLLSCAN, SORT).
 *
 * @param {object} stage Execution stage node from explain() output
 * @param {Array<string>} found Array accumulating discovered stage names
 * @returns {Array<string>} List of stage names in the execution tree
 */
export const extractStages = (stage, found = []) => {
  if (!stage || typeof stage !== 'object') return found;

  const stageName = stage.stage || stage.stageType;
  if (stageName) found.push(stageName);

  if (stage.inputStage) {
    extractStages(stage.inputStage, found);
  }
  if (Array.isArray(stage.inputStages)) {
    for (const input of stage.inputStages) {
      extractStages(input, found);
    }
  }
  return found;
};

/**
 * Traverses an execution stats tree to locate index details (indexName, multiKey).
 *
 * @param {object} stage Execution stage node
 * @returns {object|null} Index details if IXSCAN is present
 */
export const findIndexDetails = (stage) => {
  if (!stage || typeof stage !== 'object') return null;

  if (stage.stage === 'IXSCAN' || stage.stageType === 'IXSCAN') {
    return {
      indexName: stage.indexName || (stage.keyPattern ? JSON.stringify(stage.keyPattern) : 'unknown_index'),
      keyPattern: stage.keyPattern || null,
      isMultiKey: Boolean(stage.isMultiKey),
      direction: stage.direction || 'forward',
    };
  }

  if (stage.inputStage) {
    const found = findIndexDetails(stage.inputStage);
    if (found) return found;
  }
  if (Array.isArray(stage.inputStages)) {
    for (const input of stage.inputStages) {
      const found = findIndexDetails(input);
      if (found) return found;
    }
  }
  return null;
};

/**
 * Analyzes a Mongoose or native MongoDB query execution plan using explain('executionStats').
 *
 * @param {object} queryOrModel Mongoose Query, Aggregate, or Model
 * @param {object} [filter] Optional filter if passing a Model
 * @param {object} [options] Optional options (sort, projection, limit) if passing a Model
 * @returns {Promise<object>} Query performance analysis and optimization diagnostics
 */
export const analyzeQueryPlan = async (queryOrModel, filter = {}, options = {}) => {
  let explainOutput;

  try {
    if (queryOrModel && typeof queryOrModel.explain === 'function') {
      // Direct Mongoose Query or Aggregate
      explainOutput = await queryOrModel.explain('executionStats');
    } else if (queryOrModel && typeof queryOrModel.find === 'function') {
      // Model passed with filter/options
      let q = queryOrModel.find(filter);
      if (options.select) q = q.select(options.select);
      if (options.sort) q = q.sort(options.sort);
      if (options.limit) q = q.limit(options.limit);
      explainOutput = await q.explain('executionStats');
    } else {
      throw new Error('Invalid queryOrModel: must be a Mongoose Query, Aggregate, or Model');
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to execute explain on query: ${err.message}`,
      isOptimized: false,
    };
  }

  const executionStats = explainOutput.executionStats || {};
  const queryPlanner = explainOutput.queryPlanner || {};
  const executionStages = executionStats.executionStages || queryPlanner.winningPlan || {};

  const allStages = extractStages(executionStages);
  const indexDetails = findIndexDetails(executionStages);

  const winningStage = queryPlanner.winningPlan?.stage || executionStages.stage || 'UNKNOWN';
  const totalDocsExamined = executionStats.totalDocsExamined ?? 0;
  const totalKeysExamined = executionStats.totalKeysExamined ?? 0;
  const nReturned = executionStats.nReturned ?? 0;
  const executionTimeMillis = executionStats.executionTimeMillis ?? 0;

  const isCollectionScan = allStages.includes('COLLSCAN');
  const isIndexScan = allStages.includes('IXSCAN');
  const hasInMemorySort = allStages.includes('SORT') && !allStages.includes('SORT_KEY_GENERATOR');

  // Calculate scan efficiency ratio (docs returned / docs examined)
  let efficiencyRatio = 1.0;
  if (totalDocsExamined > 0) {
    efficiencyRatio = Math.round((nReturned / totalDocsExamined) * 100) / 100;
  }

  const warnings = [];

  if (isCollectionScan) {
    warnings.push('CRITICAL: Collection scan detected (COLLSCAN). An appropriate index should be created for this query filter.');
  }

  if (totalDocsExamined > 0 && nReturned === 0) {
    warnings.push(`INEFFICIENT: Examined ${totalDocsExamined} documents but returned 0. Filter selectivity is poor or missing compound index.`);
  } else if (totalDocsExamined > 5 * Math.max(nReturned, 1)) {
    warnings.push(`WARNING: High document-to-result scan ratio. Examined ${totalDocsExamined} documents to return ${nReturned} (${efficiencyRatio * 100}% efficiency).`);
  }

  if (hasInMemorySort) {
    warnings.push('WARNING: In-memory sort detected. Add the sort field to the index prefix or compound index to avoid RAM sort limits.');
  }

  if (executionTimeMillis > 100) {
    warnings.push(`SLOW: Query execution took ${executionTimeMillis}ms, exceeding the 100ms threshold.`);
  }

  const isOptimized = !isCollectionScan && !hasInMemorySort && warnings.length === 0;

  return {
    success: true,
    isOptimized,
    winningStage,
    allStages,
    indexUsed: indexDetails ? indexDetails.indexName : null,
    indexDetails,
    metrics: {
      nReturned,
      totalDocsExamined,
      totalKeysExamined,
      executionTimeMillis,
      efficiencyRatio,
    },
    flags: {
      isIndexScan,
      isCollectionScan,
      hasInMemorySort,
    },
    warnings,
  };
};

/**
 * Checks whether an analyzed execution plan meets production efficiency standards.
 *
 * @param {object} analysis Analysis result returned by analyzeQueryPlan()
 * @returns {boolean} True if query is indexed and efficient
 */
export const isQueryPlanEfficient = (analysis) => {
  if (!analysis || !analysis.success) return false;
  return analysis.isOptimized || (analysis.flags?.isIndexScan && !analysis.flags?.isCollectionScan);
};

export default {
  analyzeQueryPlan,
  isQueryPlanEfficient,
  extractStages,
  findIndexDetails,
};
