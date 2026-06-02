use std::io;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(3);
pub const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(10);
pub const HEARTBEAT_MAGIC: [u8; 3] = [0xFF, 0xFE, 0x00];

pub fn is_heartbeat(data: &[u8]) -> bool {
    data == HEARTBEAT_MAGIC
}

/// Escreve um frame: [4 bytes len LE] + [payload]
pub async fn write_frame<W>(writer: &mut W, data: &[u8]) -> io::Result<()>
where
    W: AsyncWriteExt + Unpin,
{
    let len = data.len() as u32;
    writer.write_all(&len.to_le_bytes()).await?;
    writer.write_all(data).await?;
    writer.flush().await
}

/// Lê um frame: [4 bytes len LE] + [payload]
pub async fn read_frame<R>(reader: &mut R) -> io::Result<Vec<u8>>
where
    R: AsyncReadExt + Unpin,
{
    let mut len_buf = [0u8; 4];
    reader.read_exact(&mut len_buf).await?;
    let len = u32::from_le_bytes(len_buf) as usize;
    if len > 65536 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "frame too large",
        ));
    }
    let mut buf = vec![0u8; len];
    reader.read_exact(&mut buf).await?;
    Ok(buf)
}
