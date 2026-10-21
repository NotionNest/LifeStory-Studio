use image::{DynamicImage, ImageDecoder, ImageFormat, ImageReader, Limits};
use std::io::Cursor;

pub const MAX_BYTES: usize = 25 * 1024 * 1024;
pub const MAX_PIXELS: u64 = 40_000_000;
pub const MAX_EDGE: u32 = 16_384;

fn decode(bytes: &[u8]) -> Result<(ImageFormat, DynamicImage), String> {
    if bytes.len() > MAX_BYTES {
        return Err("图片超过 25 MiB".into());
    }
    let format = image::guess_format(bytes).map_err(|_| "无法识别图片格式")?;
    if !matches!(
        format,
        ImageFormat::Png | ImageFormat::Jpeg | ImageFormat::WebP
    ) {
        return Err("不支持此图片格式".into());
    }
    // Animated images require a separate product decision; never silently take frame one.
    if format == ImageFormat::Png {
        let decoder =
            image::codecs::png::PngDecoder::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
        if decoder.is_apng().map_err(|e| e.to_string())? {
            return Err("暂不支持动画图片".into());
        }
    }
    if format == ImageFormat::WebP {
        let decoder =
            image::codecs::webp::WebPDecoder::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
        if decoder.has_animation() {
            return Err("暂不支持动画图片".into());
        }
    }
    let (width, height) = ImageReader::with_format(Cursor::new(bytes), format)
        .into_dimensions()
        .map_err(|e| e.to_string())?;
    if width > MAX_EDGE || height > MAX_EDGE || u64::from(width) * u64::from(height) > MAX_PIXELS {
        return Err("图片尺寸超过限制".into());
    }
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_EDGE);
    limits.max_image_height = Some(MAX_EDGE);
    limits.max_alloc = Some(256 * 1024 * 1024);
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    reader.limits(limits);
    let mut decoder = reader.into_decoder().map_err(|e| e.to_string())?;
    let orientation = decoder.orientation().map_err(|e| e.to_string())?;
    let mut image = DynamicImage::from_decoder(decoder).map_err(|e| e.to_string())?;
    image.apply_orientation(orientation);
    Ok((format, image))
}

pub fn validate(bytes: &[u8]) -> Result<(ImageFormat, u32, u32), String> {
    let (format, image) = decode(bytes)?;
    Ok((format, image.width(), image.height()))
}

pub fn clipboard_rgba(bytes: &[u8]) -> Result<(Vec<u8>, u32, u32), String> {
    let (_, image) = decode(bytes)?;
    let (width, height) = (image.width(), image.height());
    Ok((image.into_rgba8().into_raw(), width, height))
}

pub struct PreparedImage {
    pub media_type: &'static str,
    pub width: u32,
    pub height: u32,
    pub preview: Vec<u8>,
}
pub fn prepare(bytes: &[u8]) -> Result<PreparedImage, String> {
    let (format, image) = decode(bytes)?;
    let media_type = match format {
        ImageFormat::Png => "image/png",
        ImageFormat::Jpeg => "image/jpeg",
        ImageFormat::WebP => "image/webp",
        _ => unreachable!(),
    };
    let mut preview = Cursor::new(Vec::new());
    image
        .thumbnail(image.width().min(1024), image.height().min(1024))
        .write_to(&mut preview, ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(PreparedImage {
        media_type,
        width: image.width(),
        height: image.height(),
        preview: preview.into_inner(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn independent_static_fixtures_decode_by_signature() {
        for bytes in [
            include_bytes!("../fixtures/static.png").as_slice(),
            include_bytes!("../fixtures/static.jpg").as_slice(),
            include_bytes!("../fixtures/static.webp").as_slice(),
        ] {
            assert_eq!(validate(bytes).unwrap().1, 8);
            assert!(validate(&bytes[..bytes.len() / 2]).is_err());
        }
    }
    #[test]
    fn animations_unsupported_and_resource_limits_are_rejected() {
        for bytes in [
            include_bytes!("../fixtures/animated.png").as_slice(),
            include_bytes!("../fixtures/animated.webp").as_slice(),
            b"not an image",
        ] {
            assert!(validate(bytes).is_err());
        }
        assert!(validate(&vec![0; MAX_BYTES + 1]).is_err());
        assert!(validate(include_bytes!("../fixtures/oversize.png")).is_err());
        assert!(validate(include_bytes!("../fixtures/overpixels.png")).is_err());
    }
}

#[cfg(test)]
mod preview_tests {
    use super::*;
    #[test]
    fn preview_applies_exif_orientation_without_changing_original_bytes() {
        let bytes = include_bytes!("../fixtures/oriented.jpg");
        let (rgba, width, height) = clipboard_rgba(bytes).unwrap();
        assert_eq!((width, height, rgba.len()), (6, 8, 6 * 8 * 4));
        let prepared = prepare(bytes).unwrap();
        assert_eq!((prepared.width, prepared.height), (6, 8));
        let preview = image::load_from_memory(&prepared.preview).unwrap();
        assert_eq!((preview.width(), preview.height()), (6, 8));
        let mut decoder = ImageReader::new(Cursor::new(&prepared.preview))
            .with_guessed_format()
            .unwrap()
            .into_decoder()
            .unwrap();
        assert!(decoder.exif_metadata().unwrap().is_none());
    }
}
