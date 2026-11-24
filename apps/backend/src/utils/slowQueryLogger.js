import { logger } from './logger.js';

class SlowQueryTracker {
  constructor() {
    this.totalQueries = 0;
    this.slowQueries = 0;
    this.slowestQueryMs = 0;
    this.recentSlowQueries = [];
    this.maxHistory = 50;
  }

  recordQuery(durationMsOrObj, queryInfo = {}) {
    this.totalQueries += 1;
    const threshold = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS, 10) || 100;

    let durationMs;
    let info;
    if (typeof durationMsOrObj === 'object' && durationMsOrObj !== null) {
      durationMs = durationMsOrObj.durationMs || 0;
      info = durationMsOrObj;
    } else {
      durationMs = durationMsOrObj;
      info = queryInfo;
    }

    if (durationMs >= threshold) {
      this.slowQueries += 1;
      if (durationMs > this.slowestQueryMs) {
        this.slowestQueryMs = durationMs;
      }

      const record = {
        timestamp: new Date().toISOString(),
        durationMs,
        thresholdMs: threshold,
        model: info.modelName || info.model || 'Unknown',
        modelName: info.modelName || info.model || 'Unknown',
        op: info.operation || info.op || 'query',
        operation: info.operation || info.op || 'query',
        filter: info.filter || {},
        projection: info.projection || null,
      };

      this.recentSlowQueries.unshift(record);
      if (this.recentSlowQueries.length > this.maxHistory) {
        this.recentSlowQueries.pop();
      }

      logger.warn(
        `⚠️ [SLOW_QUERY_ALERT] Model: ${record.model} | Op: ${record.op} | Duration: ${durationMs}ms (Threshold: ${threshold}ms) | Filter: ${JSON.stringify(record.filter)}`
      );
    }
  }

  getMetrics() {
    const totalDuration = this.recentSlowQueries.reduce((acc, q) => acc + (q.durationMs || 0), 0);
    const avgSlowQueryDurationMs = this.recentSlowQueries.length > 0
      ? Math.round(totalDuration / this.recentSlowQueries.length)
      : 0;

    const summary = {
      totalRecorded: this.slowQueries,
      totalQueriesTracked: this.totalQueries,
      slowestQueryMs: this.slowestQueryMs,
      avgSlowQueryDurationMs,
      thresholdMs: parseInt(process.env.SLOW_QUERY_THRESHOLD_MS, 10) || 100,
    };

    return {
      summary,
      totalQueriesTracked: this.totalQueries,
      slowQueryCount: this.slowQueries,
      slowestQueryMs: this.slowestQueryMs,
      thresholdMs: summary.thresholdMs,
      recentQueries: [...this.recentSlowQueries],
      recentSlowQueries: [...this.recentSlowQueries],
    };
  }

  clear() {
    this.totalQueries = 0;
    this.slowQueries = 0;
    this.slowestQueryMs = 0;
    this.recentSlowQueries = [];
  }
}

export const slowQueryTracker = new SlowQueryTracker();

/**
 * Mongoose Plugin: Hooks into query execution lifecycle to track duration and log slow queries.
 */
export const slowQueryPlugin = (schema) => {
  const queryOps = [
    'find',
    'findOne',
    'findOneAndUpdate',
    'findOneAndDelete',
    'countDocuments',
    'estimatedDocumentCount',
  ];

  queryOps.forEach((op) => {
    schema.pre(op, function () {
      this._queryStartTime = Date.now();
    });

    schema.post(op, function (res) {
      if (this._queryStartTime) {
        const duration = Date.now() - this._queryStartTime;
        const queryInfo = {
          model: this.model?.modelName || this.schema?.options?.collection || 'Collection',
          op: this.op || op,
          filter: typeof this.getQuery === 'function' ? this.getQuery() : {},
          projection: typeof this.projection === 'function' ? this.projection() : null,
        };
        slowQueryTracker.recordQuery(duration, queryInfo);
      }
    });
  });

  // Aggregate support
  schema.pre('aggregate', function () {
    this._queryStartTime = Date.now();
  });

  schema.post('aggregate', function () {
    if (this._queryStartTime) {
      const duration = Date.now() - this._queryStartTime;
      const queryInfo = {
        model: this._model?.modelName || 'Aggregate',
        op: 'aggregate',
        filter: this.pipeline ? this.pipeline() : [],
      };
      slowQueryTracker.recordQuery(duration, queryInfo);
    }
  });
};

/**
 * Attaches the slow query logger plugin globally to Mongoose.
 *
 * @param {object} mongooseInstance
 */
export const attachSlowQueryLogger = (mongooseInstance) => {
  if (mongooseInstance && typeof mongooseInstance.plugin === 'function') {
    mongooseInstance.plugin(slowQueryPlugin);
  }
};

export const getSlowQueryMetrics = () => slowQueryTracker.getMetrics();
export const clearSlowQueryMetrics = () => slowQueryTracker.clear();

export default slowQueryTracker;
