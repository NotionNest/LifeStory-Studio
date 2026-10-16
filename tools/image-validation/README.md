# 图片能力验证

用途：LIB-01 的双平台解码与限制验证，不是正式导入接口。独立 Cargo 锁文件将验证与桌面发布依赖分开；正式接入时复用经过验证的规则并补齐流式读取、对象存储和编辑器交互。

运行：`cargo test --locked --manifest-path tools/image-validation/Cargo.toml`。

`fixtures` 为 Pillow 12.3.0 生成的合成图片，无用户资料：静态 8×6 RGB PNG/JPEG/WebP、两帧 APNG/动画 WebP，以及 17000×1 单边超限、7000×6000 总像素超限 PNG。静态样本依据文件签名解码，动画明确拒绝，截断/未知输入和尺寸/字节超限必须失败。样本不代表所有色彩空间、EXIF 方向或跨平台 UI 都已验证。

格式与能力结果见 [图片支持矩阵](../../docs/features/IMAGE_CAPABILITIES.md)。
