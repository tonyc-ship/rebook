use crate::models::{Book, Chapter};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use roxmltree::Document;
use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use zip::ZipArchive;

pub fn parse_epub(base64: String) -> Result<Book, String> {
    let bytes = STANDARD
        .decode(base64.as_bytes())
        .map_err(|error| format!("Invalid base64: {error}"))?;
    let reader = Cursor::new(bytes);
    let mut zip = ZipArchive::new(reader)
        .map_err(|error| format!("Invalid EPUB archive: {error}"))?;

    let container_xml = read_zip_file(&mut zip, "META-INF/container.xml")?;
    let opf_path = find_rootfile(&container_xml)?;
    let opf_xml = read_zip_file(&mut zip, &opf_path)?;

    let (title, author, manifest, spine, cover) = parse_opf(&opf_xml)?;
    let mut chapters = Vec::new();

    for (index, idref) in spine.iter().enumerate() {
        let href = match manifest.get(idref) {
            Some(item) => &item.href,
            None => continue,
        };
        let chapter_path = resolve_relative_path(&opf_path, href);
        let content = match read_zip_file(&mut zip, &chapter_path) {
            Ok(content) => content,
            Err(_) => continue,
        };
        let chapter_title = extract_title(&content)
            .unwrap_or_else(|| format!("Chapter {}", index + 1));
        let text = html2text::from_read(content.as_bytes(), 120);
        let clean_text = text.trim().to_string();
        if clean_text.is_empty() {
            continue;
        }
        let word_count = clean_text.split_whitespace().count();
        chapters.push(Chapter {
            id: format!("chapter-{}", index + 1),
            title: chapter_title,
            text: clean_text,
            word_count,
        });
    }

    if chapters.is_empty() {
        return Err("No readable chapters found in EPUB.".to_string());
    }

    let (cover_base64, cover_mime) = match cover {
        Some((href, mime)) => {
            let mut cover_href = href;
            let mut cover_mime = mime;

            if cover_href.to_lowercase().ends_with(".xhtml")
                || cover_href.to_lowercase().ends_with(".html")
            {
                let cover_path = resolve_relative_path(&opf_path, &cover_href);
                if let Ok(content) = read_zip_file(&mut zip, &cover_path) {
                    if let Some(src) = extract_first_image_src(&content) {
                        cover_href = src;
                        cover_mime = None;
                    }
                }
            }

            let path = resolve_relative_path(&opf_path, &cover_href);
            match read_zip_bytes(&mut zip, &path) {
                Ok(bytes) => {
                    let resolved_mime = cover_mime
                        .or_else(|| mime_from_path(&cover_href))
                        .or_else(|| mime_from_bytes(&bytes));
                    (Some(STANDARD.encode(bytes)), resolved_mime)
                }
                Err(_) => (None, None),
            }
        }
        None => (None, None),
    };

    Ok(Book {
        title: title.unwrap_or_else(|| "Untitled Book".to_string()),
        author,
        chapters,
        cover_base64,
        cover_mime,
    })
}

fn read_zip_file(zip: &mut ZipArchive<Cursor<Vec<u8>>>, path: &str) -> Result<String, String> {
    match zip.by_name(path) {
        Ok(mut file) => {
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes)
                .map_err(|error| format!("Failed reading {path}: {error}"))?;
            return Ok(String::from_utf8_lossy(&bytes).to_string());
        }
        Err(_) => {}
    }

    let decoded = percent_decode_path(path);
    let mut file = zip
        .by_name(&decoded)
        .map_err(|error| format!("Missing file {path}: {error}"))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|error| format!("Failed reading {path}: {error}"))?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

fn read_zip_bytes(
    zip: &mut ZipArchive<Cursor<Vec<u8>>>,
    path: &str,
) -> Result<Vec<u8>, String> {
    match zip.by_name(path) {
        Ok(mut file) => {
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes)
                .map_err(|error| format!("Failed reading {path}: {error}"))?;
            return Ok(bytes);
        }
        Err(_) => {}
    }

    let decoded = percent_decode_path(path);
    let mut file = zip
        .by_name(&decoded)
        .map_err(|error| format!("Missing file {path}: {error}"))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|error| format!("Failed reading {path}: {error}"))?;
    Ok(bytes)
}

fn find_rootfile(container_xml: &str) -> Result<String, String> {
    let document = Document::parse(container_xml)
        .map_err(|error| format!("Invalid container.xml: {error}"))?;
    let rootfile = document
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == "rootfile")
        .and_then(|node| node.attribute("full-path"))
        .ok_or_else(|| "EPUB container missing rootfile".to_string())?;
    Ok(rootfile.to_string())
}

#[derive(Clone)]
struct ManifestItem {
    href: String,
    media_type: Option<String>,
    properties: Option<String>,
}

fn parse_opf(
    opf_xml: &str,
) -> Result<
    (
        Option<String>,
        Option<String>,
        HashMap<String, ManifestItem>,
        Vec<String>,
        Option<(String, Option<String>)>,
    ),
    String,
> {
    let document =
        Document::parse(opf_xml).map_err(|error| format!("Invalid OPF file: {error}"))?;
    let title = document
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == "title")
        .and_then(|node| node.text())
        .map(|text| text.trim().to_string());
    let author = document
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == "creator")
        .and_then(|node| node.text())
        .map(|text| text.trim().to_string());

    let mut manifest = HashMap::new();
    for item in document
        .descendants()
        .filter(|node| node.is_element() && node.tag_name().name() == "item")
    {
        if let (Some(id), Some(href)) = (item.attribute("id"), item.attribute("href")) {
            manifest.insert(
                id.to_string(),
                ManifestItem {
                    href: href.to_string(),
                    media_type: item.attribute("media-type").map(|value| value.to_string()),
                    properties: item.attribute("properties").map(|value| value.to_string()),
                },
            );
        }
    }

    let spine = document
        .descendants()
        .filter(|node| node.is_element() && node.tag_name().name() == "itemref")
        .filter_map(|node| node.attribute("idref").map(|idref| idref.to_string()))
        .collect::<Vec<_>>();

    let cover = find_cover(&document, &manifest);

    Ok((title, author, manifest, spine, cover))
}

fn find_cover(
    document: &Document,
    manifest: &HashMap<String, ManifestItem>,
) -> Option<(String, Option<String>)> {
    if let Some(item) = manifest
        .values()
        .find(|item| item.properties.as_deref().unwrap_or("").contains("cover-image"))
    {
        return Some((item.href.clone(), item.media_type.clone()));
    }

    let cover_id = document
        .descendants()
        .find(|node| {
            node.is_element()
                && node.tag_name().name() == "meta"
                && node.attribute("name") == Some("cover")
        })
        .and_then(|node| node.attribute("content"))
        .map(|value| value.to_string());

    cover_id
        .and_then(|id| manifest.get(&id))
        .map(|item| (item.href.clone(), item.media_type.clone()))
        .or_else(|| {
            document
                .descendants()
                .find(|node| {
                    node.is_element()
                        && node.tag_name().name() == "reference"
                        && node.attribute("type") == Some("cover")
                })
                .and_then(|node| node.attribute("href"))
                .map(|href| (href.to_string(), None))
        })
        .or_else(|| {
            manifest
                .iter()
                .filter(|(_, item)| {
                    item.media_type
                        .as_deref()
                        .unwrap_or("")
                        .to_lowercase()
                        .starts_with("image/")
                })
                .find(|(id, item)| {
                    id.to_lowercase().contains("cover")
                        || item.href.to_lowercase().contains("cover")
                })
                .map(|(_, item)| (item.href.clone(), item.media_type.clone()))
        })
}

fn mime_from_path(path: &str) -> Option<String> {
    let lower = path.to_lowercase();
    if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        return Some("image/jpeg".to_string());
    }
    if lower.ends_with(".png") {
        return Some("image/png".to_string());
    }
    if lower.ends_with(".webp") {
        return Some("image/webp".to_string());
    }
    if lower.ends_with(".gif") {
        return Some("image/gif".to_string());
    }
    None
}

fn mime_from_bytes(bytes: &[u8]) -> Option<String> {
    if bytes.len() >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
        return Some("image/jpeg".to_string());
    }
    if bytes.len() >= 8
        && bytes[0] == 0x89
        && bytes[1] == 0x50
        && bytes[2] == 0x4E
        && bytes[3] == 0x47
        && bytes[4] == 0x0D
        && bytes[5] == 0x0A
        && bytes[6] == 0x1A
        && bytes[7] == 0x0A
    {
        return Some("image/png".to_string());
    }
    if bytes.len() >= 6 && (bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a")) {
        return Some("image/gif".to_string());
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some("image/webp".to_string());
    }
    None
}

fn extract_title(content: &str) -> Option<String> {
    let document = Document::parse(content).ok()?;
    document
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == "title")
        .and_then(|node| node.text())
        .map(|text| text.trim().to_string())
}

fn extract_first_image_src(content: &str) -> Option<String> {
    let document = Document::parse(content).ok()?;
    document
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == "img")
        .and_then(|node| node.attribute("src"))
        .map(|src| src.trim().to_string())
}

fn resolve_relative_path(opf_path: &str, href: &str) -> String {
    let base = Path::new(opf_path)
        .parent()
        .unwrap_or_else(|| Path::new(""));
    let joined = base.join(href);
    normalize_path(&joined)
}

fn normalize_path(path: &Path) -> String {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::ParentDir => {
                normalized.pop();
            }
            std::path::Component::CurDir => {}
            other => normalized.push(other),
        }
    }
    normalized.to_string_lossy().replace('\\', "/")
}

fn percent_decode_path(path: &str) -> String {
    let bytes = path.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hi = bytes[index + 1];
            let lo = bytes[index + 2];
            let value = (hex_value(hi), hex_value(lo));
            if let (Some(hi), Some(lo)) = value {
                output.push((hi << 4) | lo);
                index += 3;
                continue;
            }
        }
        output.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&output).to_string()
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}
