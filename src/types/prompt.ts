export interface FeishuFile {
  file_token: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  tmp_url?: string;
  /** extra 参数，用于 batch_get_tmp_download_url 鉴权（高级权限表格需要） */
  extra?: string;
  /** Aspect ratio (width/height), set by backend */
  aspectRatio?: number | null;
  /** 七牛云 CDN 地址（永久有效），由同步脚本自动填入 */
  qiniu_url?: string;
}

export interface PromptItem {
  id: string;
  title: string;
  category: string;
  content: string;
  project?: string;
  department?: string;
  aiTool?: string;
  aiModel?: string;
  refImages?: FeishuFile[];
  results?: FeishuFile[];
  /** 图片类型（多选）：效果图（低点）、效果图（鸟瞰）、分析图、平面图、总平面图 等 */
  imageTypes?: string[];
  /** 建筑类型（多选）：住宅、商办、教育、工业、公建、其他 */
  buildingTypes?: string[];
  /** 光影天气（多选）：白天、黄昏、夜晚、阴天、雨天 */
  weatherTypes?: string[];
  /** 分析图类型（多选）：剖面分析、爆炸图分析、概念分析、区位分析 等 */
  diagramTypes?: string[];
}

/** One card on the homepage — one result image + the shared prompt data */
export interface PromptCardItem {
  cardKey: string;
  resultImage: FeishuFile | null;
  prompt: PromptItem;
}
