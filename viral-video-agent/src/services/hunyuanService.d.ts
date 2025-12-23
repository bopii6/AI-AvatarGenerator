/**
 * 腾讯混元大模型服务
 * 用于文案改写和标题生成
 */
export interface HunyuanConfig {
    secretId: string;
    secretKey: string;
    region?: string;
}
export type RewriteMode = 'auto' | 'custom' | 'same';
/**
 * 文案改写
 */
export declare function rewriteCopy(config: HunyuanConfig, originalText: string, mode: RewriteMode, customInstruction?: string): Promise<string>;
/**
 * 生成爆款标题
 */
export declare function generateTitles(config: HunyuanConfig, content: string, count?: number): Promise<string[]>;
/**
 * 生成热门话题标签
 */
export declare function generateHashtags(config: HunyuanConfig, content: string, count?: number): Promise<string[]>;
/**
 * 分析文案的爆款规律
 */
export declare function analyzeCopyPattern(config: HunyuanConfig, copies: string): Promise<string>;
