import { invoke } from '@tauri-apps/api/core'
export interface AiProfile {id:string;label:string;service:string;protocol:string;baseUrl:string;model:string;contextChars:number;maxOutputTokens:number;downstream:string|null;codexPath:string|null;outputTokenParameter?:string|null;cliModelMode?:'inherit'|'selected'|'custom'|null;reasoningEffort?:string|null;cliVersion?:string|null}
export interface AiTask {id:string;recordId:string;status:string;partial:string;error:string|null;resultId:string|null}
export interface AiRelated {id:string;title:string|null;kind:'text'|'conversation'|'draft';unavailable:boolean;revisionId:string|null}
export interface AiWorkspace {id:string;title:string|null;kind:string;messages:{id:string;role:string;text:string;images?:string[];sequence:number}[];sources:AiRelated[];related:AiRelated[];task:AiTask|null;profileId?:string|null;linkedDiaryId?:string|null;adoptedSequence?:number;previewTaskId?:string|null;contextIds?:string[];effectiveModel?:string|null;effectiveEffort?:string|null}
export interface AiPreferences {defaultProfileId:string|null;checks?:{profileId:string;testedAt:number;textStreaming:boolean;error:string|null}[]}
export interface ChatSummary {id:string;title:string|null;updatedAt:number;profileId:string|null}
export interface DiaryPreview {taskId:string;text:string;title:string;recordDate:string;mode:'create'|'append'|'rewrite';targetId:string|null;targetVersion:number|null;adoptedId:string|null;targetText?:string|null;canUndo?:boolean}
export interface CliInstallation {kind:string;name:string;path:string;version:string;generationSupported:boolean;error:string|null;preferred?:boolean}
export interface CliModel {model:string;displayName:string;supportedReasoningEfforts:{reasoningEffort:string;description:string}[];defaultReasoningEffort:string|null;isDefault:boolean}
export interface CliCatalog {version?:string;models:CliModel[];currentModel:string|null;currentEffort:string|null}
export interface CliConnectionReport {version:string;modelReply:boolean;model:string|null;detail:string}
export const aiApi={
 testCli:(profile:AiProfile,requestId:string)=>invoke<CliConnectionReport>('ai_test_cli',{profile,requestId}),
 codexProbe:(path:string,requestId:string)=>invoke<string>('ai_codex_probe',{path,requestId}),
 cancelTest:(requestId:string)=>invoke<void>('ai_cancel_test',{requestId}),
 scanCli:()=>invoke<CliInstallation[]>('ai_cli_scan'),
 codexCatalog:(path:string)=>invoke<CliCatalog>('ai_codex_catalog',{path}),
 codexModels:(path:string)=>invoke<string[]>('ai_codex_models',{path}),
 inspectCodex:(path?:string)=>invoke<{path:string;version:string;compatible:boolean}[]>('ai_codex_inspect',{path:path||null}),
 updateProfile:(profile:AiProfile,key:string)=>invoke<AiProfile>('ai_update_profile',{profile,key}),
 preferences:()=>invoke<AiPreferences>('ai_preferences'),
 setDefault:(profileId:string|null)=>invoke<void>('ai_set_default',{profileId}),
 chats:(keyword:string,offset=0)=>invoke<{items:ChatSummary[];nextOffset:number|null}>('ai_chat_list',{keyword,offset}),
 rename:(recordId:string,title:string)=>invoke<void>('ai_chat_rename',{recordId,title}),
 send:(input:{requestId:string;conversationId:string|null;profileId:string;text:string;sourceIds:string[];recordDate:string;timezone:string})=>invoke<AiTask>('ai_chat_send',{input}),
 generatePreview:(input:{requestId:string;recordId:string;profileId:string;mode:'create'|'append'|'rewrite';targetId:string|null;sourceIds:string[]})=>invoke<AiTask>('ai_preview_generate',{input}),
 preview:(taskId:string)=>invoke<DiaryPreview>('ai_preview',{taskId}),
 undoAdoption:(taskId:string)=>invoke<{recordId:string}>('ai_undo_adoption',{taskId}),
 adopt:(input:{taskId:string;requestId:string;title:string;recordDate:string;text:string})=>invoke<{recordId:string}>('ai_adopt',{input}),
 importImage:async(recordId:string,file:File)=>{if(file.size>25*1024*1024)throw new Error('图片超过 25 MiB');const bytes=new Uint8Array(await file.arrayBuffer());const metadata=new TextEncoder().encode(JSON.stringify({recordId,requestId:crypto.randomUUID(),name:file.name}));const packet=new Uint8Array(4+metadata.length+bytes.length);new DataView(packet.buffer).setUint32(0,metadata.length,true);packet.set(metadata,4);packet.set(bytes,4+metadata.length);return invoke<void>('ai_import_image',packet)},
 models:(profileId:string)=>invoke<string[]>('ai_models',{profileId}),
 profiles:()=>invoke<AiProfile[]>('ai_profiles'),
 configure:(profile:AiProfile,key:string)=>invoke<AiProfile>('ai_configure',{profile,key}),
 removeProfile:(profileId:string)=>invoke<void>('ai_delete_profile',{profileId}),
 test:(profileId:string,requestId=crypto.randomUUID())=>invoke<void>('ai_test',{profileId,requestId}),
 create:(recordDate:string,timezone:string)=>invoke<string>('ai_create_conversation',{recordDate,timezone}),
 workspace:(recordId:string)=>invoke<AiWorkspace>('ai_workspace',{recordId}),
 task:(taskId:string)=>invoke<AiTask>('ai_task',{taskId}),
 start:(input:{requestId:string;recordId:string;profileId:string;kind:string;text:string;sourceIds:string[]})=>invoke<AiTask>('ai_start',{input}),
 retrySave:(taskId:string)=>invoke<void>('ai_retry_save',{taskId}),
 cancel:(taskId:string)=>invoke<void>('ai_cancel',{taskId}),
 compare:(ownerId:string,sourceId:string,revisionId:string)=>invoke<string>('ai_compare',{ownerId,sourceId,revisionId}),
}
export const providerPresets=[
 ['openai','OpenAI','responses','https://api.openai.com/v1'],['anthropic','Anthropic / Claude','messages','https://api.anthropic.com/v1'],['google','Google / Gemini','gemini','https://generativelanguage.googleapis.com/v1beta'],['xai','xAI / Grok','responses','https://api.x.ai/v1'],['mistral','Mistral','chat','https://api.mistral.ai/v1'],['deepseek','DeepSeek','chat','https://api.deepseek.com'],['qwen','阿里云百炼 / 通义','chat','https://dashscope.aliyuncs.com/compatible-mode/v1'],['doubao','火山方舟 / 豆包','chat','https://ark.cn-beijing.volces.com/api/v3'],['kimi','Moonshot / Kimi','chat','https://api.moonshot.cn/v1'],['zhipu','智谱 / GLM','chat','https://open.bigmodel.cn/api/paas/v4'],['minimax','MiniMax','chat','https://api.minimax.io/v1'],['baidu','百度千帆','chat','https://qianfan.baidubce.com/v2'],['tencent','腾讯云 / 混元','chat','https://api.hunyuan.cloud.tencent.com/v1'],['siliconflow','硅基流动','chat','https://api.siliconflow.cn/v1'],['openrouter','OpenRouter','chat','https://openrouter.ai/api/v1'],['custom','自定义兼容服务','chat',''],['codex','本机 Codex','codex',''],
] as const
