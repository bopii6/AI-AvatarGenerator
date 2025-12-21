/**
 * AI 封面生成服务
 * 使用阿里通义万相生成封面图片
 */
export interface WanxiangConfig {
    accessKeyId: string;
    accessKeySecret: string;
}
/**
 * 生成AI封面
 */
export declare function generateCover(config: WanxiangConfig, prompt: string, outputDir: string, options?: {
    style?: string;
    count?: number;
}): Promise<string[]>;
/**
 * 为封面添加文字标题
 */
export declare function addTextToCover(imagePath: string, text: string, outputPath: string, options?: {
    fontSize?: number;
    fontColor?: string;
    position?: 'top' | 'center' | 'bottom';
}): Promise<string>;
