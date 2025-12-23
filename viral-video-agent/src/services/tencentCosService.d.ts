export interface TencentCosConfig {
    secretId: string;
    secretKey: string;
    bucket: string;
    region: string;
    /** e.g. `voice-samples/` */
    prefix?: string;
    signedUrlExpiresSeconds?: number;
}
export declare function uploadVoiceSampleToCos(config: TencentCosConfig, params: {
    buffer: Buffer;
    fileName?: string;
    deviceId?: string;
}): Promise<{
    bucket: string;
    region: string;
    key: string;
    signedUrl: string;
}>;
