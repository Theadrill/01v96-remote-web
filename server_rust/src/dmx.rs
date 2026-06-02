use std::path::Path;
use std::process::{Command, Stdio};
use std::time;

pub fn start_dmx_app(force: bool, root_dir: &str) {
    let exe_path_str = format!("{}\\ArtNetToDMX_FTDI\\ArtNetToDMX.exe", root_dir);
    let exe_path = Path::new(&exe_path_str);

    update_lumikit_config(root_dir);

    // Simple check via tasklist
    let output = Command::new("tasklist")
        .arg("/FI")
        .arg("IMAGENAME eq ArtNetToDMX.exe")
        .output()
        .expect("Failed to execute tasklist");

    let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
    let is_running = stdout.contains("artnettodmx.exe");

    if is_running && !force {
        println!("Y' [DMX] Aplicativo de luz j est em execuo. Nenhuma ao necessria no boot.");
        return;
    }

    if is_running && force {
        println!("T? [DMX] Forando reinicializao do aplicativo...");
        let _ = Command::new("taskkill")
            .args(&["/F", "/IM", "ArtNetToDMX.exe"])
            .output();
        spawn_dmx(exe_path);
    } else {
        println!("YZ [DMX] Iniciando aplicativo de luz...");
        spawn_dmx(exe_path);
    }
}

fn spawn_dmx(exe_path: &Path) {
    if !exe_path.exists() {
        eprintln!("?O [DMX] Executvel no encontrado em {:?}", exe_path);
        return;
    }

    if let Some(parent) = exe_path.parent() {
        match Command::new(exe_path)
            .current_dir(parent)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(_) => println!("Ys? [DMX] Sistema de luz online!"),
            Err(e) => eprintln!("?O [DMX] Erro ao abrir executvel: {}", e),
        }
    }
}

pub fn reset_dmx_system(root_dir: String) {
    println!("Ys? [DMX] Iniciando procedimento de reset de hardware (USB) e software...");

    tokio::spawn(async move {
        let _ = Command::new("taskkill")
            .args(&["/F", "/IM", "LumikitSHOW.exe"])
            .output();
        let _ = Command::new("taskkill")
            .args(&["/F", "/IM", "ArtNetToDMX.exe"])
            .output();

        tokio::time::sleep(time::Duration::from_millis(1000)).await;

        println!("Y\" [DMX] Executando reset USB elevado via PowerShell (pnputil)...");
        let ps_cmd = "Start-Process powershell -ArgumentList '-NoProfile -Command  = Get-PnpDevice | Where-Object { .InstanceId -like ''*VID_0403&PID_6001*'' -or .FriendlyName -like ''*USB Serial Converter*'' } | Select-Object -First 1; if () { pnputil /restart-device .InstanceId }' -Verb RunAs -WindowStyle Hidden -Wait";

        match Command::new("powershell")
            .args(&["-Command", ps_cmd])
            .output()
        {
            Ok(_) => println!("o. [DMX] Comando de reset enviado para o Windows e concludo."),
            Err(e) => eprintln!("?O [DMX] Erro ao disparar reset elevado: {}", e),
        }

        tokio::time::sleep(time::Duration::from_millis(3000)).await;
        println!("YZ [DMX] Iniciando ArtNetToDMX...");
        start_dmx_app(true, &root_dir);

        tokio::time::sleep(time::Duration::from_millis(3000)).await;
        let lumikit_path = Path::new("C:\\Program Files\\Lumikit\\LumikitSHOW.exe");
        if lumikit_path.exists() {
            println!("YZ [DMX] Iniciando LumikitSHOW...");
            let _ = Command::new(lumikit_path)
                .current_dir(lumikit_path.parent().unwrap())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn();
        } else {
            eprintln!(
                "?O [DMX] Executvel Lumikit no encontrado em {:?}",
                lumikit_path
            );
        }
    });
}

pub fn update_lumikit_config(root_dir: &str) {
    let config = crate::config::AppConfig::load();
    let lumikit_ips = config.lumikit_ips;
    if lumikit_ips.is_empty() {
        return;
    }

    let mut local_ips = Vec::new();
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("ipconfig").output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains("IPv4") {
                    if let Some(ip_part) = line.split(':').last() {
                        let ip = ip_part.trim();
                        if !ip.is_empty() {
                            local_ips.push(ip.to_string());
                        }
                    }
                }
            }
        }
    }

    let found_match = lumikit_ips.iter().find(|ip| local_ips.contains(ip));

    if let Some(matched_ip) = found_match {
        let info_path = Path::new(root_dir).join("ArtNetToDMX_FTDI").join("info");

        if !info_path.exists() {
            println!(
                "📝 [DMX] Arquivo \"info\" nao encontrado. Criando um novo para o IP {}...",
                matched_ip
            );
            let default_content = format!(
                "IP: {}\nUni: 0\nOneUni: true\nAutostart: true\n",
                matched_ip
            );
            if let Err(e) = std::fs::write(&info_path, default_content) {
                eprintln!("❌ [DMX] Erro ao criar o arquivo info: {}", e);
            }
            return;
        }

        if let Ok(content) = std::fs::read_to_string(&info_path) {
            let lines: Vec<String> = content
                .lines()
                .map(|line| {
                    if line.starts_with("IP:") {
                        format!("IP: {}", matched_ip)
                    } else {
                        line.to_string()
                    }
                })
                .collect();
            let new_content = lines.join("\n") + "\n";

            if content != new_content {
                if let Err(e) = std::fs::write(&info_path, new_content) {
                    eprintln!("❌ [DMX] Erro ao atualizar o arquivo info: {}", e);
                } else {
                    println!(
                        "🌐 [DMX] IP configurado automaticamente no arquivo info: {}",
                        matched_ip
                    );
                }
            } else {
                println!(
                    "🌐 [DMX] IP {} ja estava configurado corretamente.",
                    matched_ip
                );
            }
        }
    } else {
        eprintln!("⚠️ [DMX] Nenhum IP da lista \"lumikit_ips\" bate com as redes ativas deste PC.");
    }
}
