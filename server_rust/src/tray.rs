use image::GenericImageView;
use std::path::Path;
use std::sync::Mutex;
use tray_icon::menu::MenuEvent;
use tray_icon::menu::MenuId;
use tray_icon::{
    Icon, TrayIcon, TrayIconBuilder,
    menu::{Menu, MenuItem, PredefinedMenuItem},
};

pub struct TrayApp {
    pub _tray_icon: TrayIcon,
    pub connect_id: MenuId,
    pub remote_midi_id: MenuId,
    pub browser_id: MenuId,
    pub status_id: MenuId,
    pub restart_id: MenuId,
    pub quit_id: MenuId,
    port: u16,
    remote_midi: bool,
    pub shutdown_tx: Mutex<Option<tokio::sync::mpsc::Sender<()>>>,
}

pub fn load_icon(path: &Path) -> Result<Icon, Box<dyn std::error::Error>> {
    let img = image::open(path)?;
    let (width, height) = img.dimensions();
    let rgba = img.into_rgba8().into_raw();
    Ok(Icon::from_rgba(rgba, width, height)?)
}

impl TrayApp {
    pub fn new(port: u16, remote_midi: bool) -> Result<Self, Box<dyn std::error::Error>> {
        let mut icon_path = Path::new("..").join("public").join("favicon.ico");
        if let Ok(exe_path) = std::env::current_exe()
            && let Some(exe_dir) = exe_path.parent()
        {
            let path1 = exe_dir.join("public").join("favicon.ico");
            if path1.is_file() {
                icon_path = path1;
            } else {
                let mut current = exe_dir.to_path_buf();
                for _ in 0..4 {
                    if let Some(parent) = current.parent() {
                        current = parent.to_path_buf();
                        let candidate = current.join("public").join("favicon.ico");
                        if candidate.is_file() {
                            icon_path = candidate;
                            break;
                        }
                    } else {
                        break;
                    }
                }
            }
        }

        let icon = load_icon(&icon_path)
            .unwrap_or_else(|_| Icon::from_rgba(vec![0; 4 * 16 * 16], 16, 16).unwrap());

        let tray_menu = Menu::new();

        let connect_i = MenuItem::new("🔌 Conectar à Mesa", true, None);

        let remote_label = if remote_midi {
            "🌐 Modo Remoto: ON"
        } else {
            "🌐 Modo Remoto: OFF"
        };
        let remote_i = MenuItem::new(remote_label, true, None);

        let browser_i = MenuItem::new("🌐 Abrir no Navegador", true, None);
        let status_i = MenuItem::new("📊 Status do Servidor", true, None);
        let restart_i = MenuItem::new("🔄 Reiniciar Servidor", true, None);
        let quit_i = MenuItem::new("❌ Sair e Encerrar", true, None);

        let connect_id = connect_i.id().clone();
        let remote_midi_id = remote_i.id().clone();
        let browser_id = browser_i.id().clone();
        let status_id = status_i.id().clone();
        let restart_id = restart_i.id().clone();
        let quit_id = quit_i.id().clone();

        let _ = tray_menu.append(&connect_i);
        let _ = tray_menu.append(&remote_i);
        let _ = tray_menu.append(&browser_i);
        let _ = tray_menu.append(&status_i);
        let _ = tray_menu.append(&restart_i);
        let _ = tray_menu.append(&PredefinedMenuItem::separator());
        let _ = tray_menu.append(&quit_i);

        let tray_icon = TrayIconBuilder::new()
            .with_menu(Box::new(tray_menu))
            .with_tooltip("01V96 Control")
            .with_icon(icon)
            .build()?;

        Ok(Self {
            _tray_icon: tray_icon,
            connect_id,
            remote_midi_id,
            browser_id,
            status_id,
            restart_id,
            quit_id,
            port,
            remote_midi,
            shutdown_tx: Mutex::new(None),
        })
    }

    pub fn handle_event(&self, event: &MenuEvent) {
        if event.id == self.quit_id {
            println!("Saindo...");
            std::process::exit(0);
        } else if event.id == self.browser_id {
            let url = format!("http://localhost:{}", self.port);
            println!("Abrindo navegador: {}", url);
            #[cfg(target_os = "windows")]
            let _ = std::process::Command::new("cmd")
                .args(["/C", "start", &url])
                .spawn();
            #[cfg(target_os = "macos")]
            let _ = std::process::Command::new("open").arg(&url).spawn();
            #[cfg(target_os = "linux")]
            let _ = std::process::Command::new("xdg-open").arg(&url).spawn();
        } else if event.id == self.status_id {
            let url = format!("http://localhost:{}/status.html", self.port);
            println!("Abrindo página de status: {}", url);
            #[cfg(target_os = "windows")]
            let _ = std::process::Command::new("cmd")
                .args(["/C", "start", &url])
                .spawn();
            #[cfg(target_os = "macos")]
            let _ = std::process::Command::new("open").arg(&url).spawn();
            #[cfg(target_os = "linux")]
            let _ = std::process::Command::new("xdg-open").arg(&url).spawn();
        } else if event.id == self.connect_id {
            println!("Reconectando à mesa...");
        } else if event.id == self.remote_midi_id {
            let confirm_msg = if self.remote_midi {
                "Deseja DESATIVAR o Modo Remoto?\n\nO servidor será reiniciado para aplicar a alteração."
            } else {
                "Deseja ATIVAR o Modo Remoto?\n\nO servidor será reiniciado para aplicar a alteração."
            };
            if show_confirm_dialog("Confirmação", confirm_msg) {
                let mut config = crate::config::AppConfig::load();
                config.remote_midi = !config.remote_midi;
                config.save();

                println!("Reiniciando servidor após alterar Modo Remoto...");
                if let Ok(tx_guard) = self.shutdown_tx.lock()
                    && let Some(tx) = tx_guard.as_ref()
                {
                    let _ = tx.try_send(());
                    return;
                }
                let _ = std::process::Command::new(std::env::current_exe().unwrap()).spawn();
                std::process::exit(0);
            }
        } else if event.id == self.restart_id {
            println!("Reiniciando servidor...");
            if let Ok(tx_guard) = self.shutdown_tx.lock()
                && let Some(tx) = tx_guard.as_ref()
            {
                let _ = tx.try_send(());
                return;
            }
            let _ = std::process::Command::new(std::env::current_exe().unwrap()).spawn();
            std::process::exit(0);
        }
    }

    #[cfg(target_os = "windows")]
    pub fn run_message_loop(&self) {
        use std::ptr::null_mut;
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            DispatchMessageW, GetMessageW, MSG, TranslateMessage,
        };

        unsafe {
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);

                if let Ok(event) = MenuEvent::receiver().try_recv() {
                    self.handle_event(&event);
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn run_message_loop(&self) {
        loop {
            if let Ok(event) = MenuEvent::receiver().try_recv() {
                self.handle_event(&event);
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    }
}

fn show_confirm_dialog(title: &str, text: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        let title_u16: Vec<u16> = std::ffi::OsStr::new(title)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let text_u16: Vec<u16> = std::ffi::OsStr::new(text)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            let result = windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW(
                std::ptr::null_mut(),
                text_u16.as_ptr(),
                title_u16.as_ptr(),
                windows_sys::Win32::UI::WindowsAndMessaging::MB_YESNO
                    | windows_sys::Win32::UI::WindowsAndMessaging::MB_ICONQUESTION,
            );
            result == windows_sys::Win32::UI::WindowsAndMessaging::IDYES
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        true
    }
}
