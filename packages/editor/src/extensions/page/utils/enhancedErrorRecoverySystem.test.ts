import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { 
  EnhancedErrorRecoverySystem, 
  createDefaultEnhancedErrorRecoverySystem,
  EnhancedErrorRecoverySystemConfig 
} from './enhancedErrorRecoverySystem';
import { 
  AutoPageBreakError, 
  AutoPageBreakErrorType, 
  ErrorSeverity 
} from './errorRecoveryManager';
import { TruncationAlgorithm } from './enhancedContentTruncator';

// Mock编辑器
const createMockEditor = (): Editor => {
  return {
    view: {
      dom: document.createElement('div')
    },
    state: {
      doc: {}
    },
    isEditable: true,
    $nodes: () => [{}],
    storage: {}
  } as any;
};

// Mock ProseMirror节点
const createMockNode = (): ProseMirrorNode => {
  return {
    type: { name: 'pageContent' },
    content: {
      size: 100,
      childCount: 5,
      child: () => createMockNode(),
      forEach: (fn: Function) => {
        for (let i = 0; i < 5; i++) {
          fn(createMockNode());
        }
      },
      cut: (from: number, to?: number) => ({
        size: to ? to - from : 100 - from
      })
    },
    attrs: { index: 1 },
    textContent: 'Mock content',
    nodeSize: 20
  } as any;
};

describe('EnhancedErrorRecoverySystem', () => {
  let editor: Editor;
  let system: EnhancedErrorRecoverySystem;
  let config: EnhancedErrorRecoverySystemConfig;

  beforeEach(() => {
    // 设置DOM环境
    document.body.innerHTML = '<div id="test-container"></div>';
    
    editor = createMockEditor();
    
    config = {
      enabled: true,
      autoStart: false, // 手动启动以便测试
      enableEnhancedTruncation: true,
      enableSmartRetry: true,
      enableMonitoring: true,
      enableUserExperience: true,
      enableRuntimeConfig: true
    };

    system = new EnhancedErrorRecoverySystem(editor, config);
  });

  afterEach(async () => {
    await system.dispose();
    document.body.innerHTML = '';
  });

  describe('系统初始化', () => {
    it('应该正确初始化系统', () => {
      expect(system).toBeDefined();
      
      const status = system.getSystemStatus();
      expect(status.components.truncator).toBe(true);
      expect(status.components.recoveryManager).toBe(true);
      expect(status.components.monitoring).toBe(true);
      expect(status.components.config).toBe(true);
      expect(status.components.userExperience).toBe(true);
    });

    it('应该能够启动和停止系统', async () => {
      const status1 = system.getSystemStatus();
      expect(status1.initialized).toBe(false);

      await system.start();
      
      const status2 = system.getSystemStatus();
      expect(status2.initialized).toBe(true);

      await system.stop();
      
      const status3 = system.getSystemStatus();
      expect(status3.initialized).toBe(false);
    });

    it('应该使用默认配置创建系统', () => {
      const defaultSystem = createDefaultEnhancedErrorRecoverySystem(editor);
      expect(defaultSystem).toBeDefined();
      
      const status = defaultSystem.getSystemStatus();
      expect(status.components.truncator).toBe(true);
      
      defaultSystem.dispose();
    });
  });

  describe('增强版内容截断', () => {
    beforeEach(async () => {
      await system.start();
    });

    it('应该能够执行增强版内容截断', async () => {
      const mockNode = createMockNode();
      const options = {
        preserveWords: true,
        preserveParagraphs: false,
        maxHeight: 500,
        breakThreshold: 0.8,
        maxExecutionTime: 1000,
        preferredAlgorithm: TruncationAlgorithm.PRECISE,
        fallbackChain: [TruncationAlgorithm.FAST, TruncationAlgorithm.CONSERVATIVE],
        accuracyThreshold: 0.8
      };

      const result = await system.truncateContentEnhanced(mockNode, 0, options);
      
      expect(result).toBeDefined();
      expect(result.algorithmUsed).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.accuracy).toBeGreaterThanOrEqual(0);
      expect(result.accuracy).toBeLessThanOrEqual(1);
    });

    it('应该在截断失败时记录性能数据', async () => {
      const mockNode = createMockNode();
      const options = {
        preserveWords: true,
        preserveParagraphs: false,
        maxHeight: 0, // 极小的高度，应该导致截断困难
        breakThreshold: 0.8,
        maxExecutionTime: 10, // 极短的时间，可能导致超时
        preferredAlgorithm: TruncationAlgorithm.PRECISE,
        fallbackChain: [TruncationAlgorithm.CONSERVATIVE],
        accuracyThreshold: 0.95
      };

      try {
        await system.truncateContentEnhanced(mockNode, 0, options);
      } catch (error) {
        // 预期可能会失败
      }

      const performanceReport = system.getPerformanceReport();
      expect(performanceReport.systemMetrics.totalOperations).toBeGreaterThan(0);
    });
  });

  describe('智能错误处理', () => {
    beforeEach(async () => {
      await system.start();
    });

    it('应该能够处理AutoPageBreakError', async () => {
      const error = new AutoPageBreakError(
        AutoPageBreakErrorType.HEIGHT_CALCULATION_FAILED,
        'Test height calculation error',
        ErrorSeverity.MEDIUM
      );

      const result = await system.handleErrorSmart(error, {
        operationId: 'test_operation',
        pageIndex: 1
      });

      expect(result).toBeDefined();
      expect(result.decision).toBeDefined();
      expect(result.decision.action).toMatch(/retry|degrade|abort/);
    });

    it('应该能够处理普通Error', async () => {
      const error = new Error('Generic test error');

      const result = await system.handleErrorSmart(error, {
        operationId: 'test_operation_2'
      });

      expect(result).toBeDefined();
      expect(result.decision).toBeDefined();
    });

    it('应该记录错误处理统计', async () => {
      const error = new AutoPageBreakError(
        AutoPageBreakErrorType.CONTENT_TRUNCATION_FAILED,
        'Test truncation error',
        ErrorSeverity.HIGH
      );

      await system.handleErrorSmart(error);

      const performanceReport = system.getPerformanceReport();
      expect(performanceReport.systemMetrics.totalOperations).toBeGreaterThan(0);
    });
  });

  describe('系统监控和诊断', () => {
    beforeEach(async () => {
      await system.start();
    });

    it('应该能够获取系统状态', () => {
      const status = system.getSystemStatus();
      
      expect(status.initialized).toBe(true);
      expect(status.healthy).toBe(true);
      expect(status.metrics).toBeDefined();
      expect(status.diagnostic).toBeDefined();
      expect(status.userStatus).toBeDefined();
      expect(status.components).toBeDefined();
    });

    it('应该能够获取性能报告', () => {
      const report = system.getPerformanceReport();
      
      expect(report.systemMetrics).toBeDefined();
      expect(report.uptime).toBeGreaterThanOrEqual(0);
      expect(report.successRate).toBeGreaterThanOrEqual(0);
      expect(report.successRate).toBeLessThanOrEqual(1);
      expect(report.recoveryRate).toBeGreaterThanOrEqual(0);
      expect(report.recoveryRate).toBeLessThanOrEqual(1);
      expect(report.activeOperations).toBeGreaterThanOrEqual(0);
    });

    it('应该能够执行系统自检', async () => {
      const selfCheck = await system.performSystemSelfCheck();
      
      expect(selfCheck.passed).toBeDefined();
      expect(Array.isArray(selfCheck.issues)).toBe(true);
      expect(Array.isArray(selfCheck.recommendations)).toBe(true);
    });
  });

  describe('配置管理', () => {
    beforeEach(async () => {
      await system.start();
    });

    it('应该能够更新配置', () => {
      expect(() => {
        system.updateConfiguration({
          monitoring: {
            enabled: true,
            realTimeMetrics: false,
            performanceSampling: true,
            diagnosticReporting: true,
            alertsEnabled: false,
            dataRetentionPeriod: 3600000
          }
        });
      }).not.toThrow();
    });

    it('应该能够设置用户体验级别', () => {
      expect(() => {
        system.setUserExperienceLevel('minimal');
      }).not.toThrow();
      
      expect(() => {
        system.setUserExperienceLevel('verbose');
      }).not.toThrow();
    });
  });

  describe('错误场景模拟', () => {
    beforeEach(async () => {
      await system.start();
    });

    it('应该处理边界检查失败场景', async () => {
      const error = new AutoPageBreakError(
        AutoPageBreakErrorType.INPUT_DETECTION_FAILED,
        'Boundary condition check failed: Editor instance is not available',
        ErrorSeverity.CRITICAL
      );

      const result = await system.handleErrorSmart(error, {
        operationId: 'boundary_check_test',
        attempt: 1
      });

      expect(result.decision.action).toBeDefined();
      
      // 关键错误通常应该中止操作
      if (result.decision.action === 'abort') {
        expect(result.recovered).toBe(false);
      }
    });

    it('应该处理内容截断失败场景', async () => {
      const error = new AutoPageBreakError(
        AutoPageBreakErrorType.CONTENT_TRUNCATION_FAILED,
        'Content truncation failed due to measurement error',
        ErrorSeverity.HIGH
      );

      const result = await system.handleErrorSmart(error, {
        operationId: 'truncation_test',
        attempt: 1
      });

      expect(result.decision.action).toBeDefined();
      
      // 截断失败通常应该降级或重试
      expect(['retry', 'degrade'].includes(result.decision.action)).toBe(true);
    });

    it('应该处理连续失败导致的熔断器触发', async () => {
      const errorType = AutoPageBreakErrorType.HEIGHT_CALCULATION_FAILED;
      
      // 模拟连续多次失败
      for (let i = 0; i < 6; i++) {
        const error = new AutoPageBreakError(
          errorType,
          `Height calculation failed - attempt ${i + 1}`,
          ErrorSeverity.MEDIUM
        );

        await system.handleErrorSmart(error, {
          operationId: `circuit_breaker_test_${i}`,
          attempt: 1
        });
      }

      // 第7次应该触发熔断器
      const finalError = new AutoPageBreakError(
        errorType,
        'Height calculation failed - should trigger circuit breaker',
        ErrorSeverity.MEDIUM
      );

      const result = await system.handleErrorSmart(finalError, {
        operationId: 'circuit_breaker_final_test',
        attempt: 1
      });

      // 熔断器打开时应该直接中止
      expect(result.decision.action).toBe('abort');
      expect(result.decision.strategy).toBe('circuit_breaker');
    });
  });

  describe('系统恢复和重置', () => {
    beforeEach(async () => {
      await system.start();
    });

    it('应该能够执行强制重置', async () => {
      // 先产生一些操作记录
      const error = new AutoPageBreakError(
        AutoPageBreakErrorType.PAGE_CREATION_FAILED,
        'Test error for reset',
        ErrorSeverity.MEDIUM
      );
      
      await system.handleErrorSmart(error);
      
      const reportBefore = system.getPerformanceReport();
      expect(reportBefore.systemMetrics.totalOperations).toBeGreaterThan(0);

      // 执行强制重置
      await system.forceReset();

      const reportAfter = system.getPerformanceReport();
      expect(reportAfter.systemMetrics.totalOperations).toBe(0);
      expect(reportAfter.systemMetrics.successfulOperations).toBe(0);
      expect(reportAfter.systemMetrics.recoveredOperations).toBe(0);
    });

    it('重置后系统应该仍然可用', async () => {
      await system.forceReset();

      const status = system.getSystemStatus();
      expect(status.initialized).toBe(true);
      expect(status.healthy).toBe(true);

      // 测试基本功能仍然工作
      const mockNode = createMockNode();
      const options = {
        preserveWords: true,
        preserveParagraphs: false,
        maxHeight: 500,
        breakThreshold: 0.8,
        maxExecutionTime: 1000,
        preferredAlgorithm: TruncationAlgorithm.FAST,
        fallbackChain: [TruncationAlgorithm.CONSERVATIVE],
        accuracyThreshold: 0.7
      };

      const result = await system.truncateContentEnhanced(mockNode, 0, options);
      expect(result).toBeDefined();
    });
  });

  describe('性能和内存测试', () => {
    beforeEach(async () => {
      await system.start();
    });

    it('应该能够处理大量连续操作而不出现内存泄漏', async () => {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
      
      // 执行大量操作
      for (let i = 0; i < 100; i++) {
        const mockNode = createMockNode();
        const options = {
          preserveWords: false,
          preserveParagraphs: false,
          maxHeight: 300,
          breakThreshold: 0.8,
          maxExecutionTime: 100,
          preferredAlgorithm: TruncationAlgorithm.CONSERVATIVE,
          fallbackChain: [],
          accuracyThreshold: 0.5
        };

        try {
          await system.truncateContentEnhanced(mockNode, 0, options);
        } catch {
          // 忽略可能的错误，重点测试内存使用
        }
      }

      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryGrowth = finalMemory - initialMemory;
      
      // 内存增长应该在合理范围内（这里设为10MB限制）
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024);
    });

    it('应该能够在高负载下保持响应性', async () => {
      const startTime = performance.now();
      
      // 并发执行多个操作
      const promises = [];
      for (let i = 0; i < 10; i++) {
        const promise = system.handleErrorSmart(
          new AutoPageBreakError(
            AutoPageBreakErrorType.DOM_OPERATION_FAILED,
            `Concurrent error ${i}`,
            ErrorSeverity.LOW
          ),
          { operationId: `concurrent_${i}` }
        );
        promises.push(promise);
      }

      await Promise.all(promises);
      
      const totalTime = performance.now() - startTime;
      
      // 总耗时应该在合理范围内（这里设为5秒限制）
      expect(totalTime).toBeLessThan(5000);
    });
  });
});

describe('错误恢复机制集成测试', () => {
  let editor: Editor;
  let system: EnhancedErrorRecoverySystem;

  beforeEach(() => {
    editor = createMockEditor();
    system = createDefaultEnhancedErrorRecoverySystem(editor, {
      onSystemReady: () => console.log('System ready for integration test'),
      onErrorRecovered: (error, decision) => {
        console.log(`Error recovered: ${error.type} with ${decision.strategy}`);
      },
      onSystemDegraded: (errorType, strategy) => {
        console.log(`System degraded: ${errorType} using ${strategy}`);
      }
    });
  });

  afterEach(async () => {
    await system.dispose();
  });

  it('应该能够处理完整的错误恢复流程', async () => {
    // 模拟页码刷新错误的完整场景
    const boundaryError = new AutoPageBreakError(
      AutoPageBreakErrorType.INPUT_DETECTION_FAILED,
      'Boundary condition check failed: Editor instance is not available',
      ErrorSeverity.HIGH
    );

    // 第一步：边界检查失败
    const result1 = await system.handleErrorSmart(boundaryError, {
      operationId: 'page_refresh_boundary_check',
      attempt: 1
    });

    expect(result1.decision.action).toBeDefined();

    // 第二步：如果重试，模拟内容截断失败
    if (result1.decision.action === 'retry') {
      const truncationError = new AutoPageBreakError(
        AutoPageBreakErrorType.CONTENT_TRUNCATION_FAILED,
        'Content truncation failed: Unable to find suitable break point',
        ErrorSeverity.HIGH
      );

      const result2 = await system.handleErrorSmart(truncationError, {
        operationId: 'page_refresh_truncation',
        attempt: 1
      });

      expect(result2.decision.action).toBeDefined();
    }

    // 验证系统状态
    const status = system.getSystemStatus();
    expect(status.metrics.errorRate.current).toBeGreaterThan(0);

    const performanceReport = system.getPerformanceReport();
    expect(performanceReport.systemMetrics.totalOperations).toBeGreaterThan(0);
  });
});