use tray_icon::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    Icon, TrayIconBuilder, TrayIcon
};
use tray_icon::menu::MenuEvent;
use image::GenericImageView;
use std::path::Path;
use tray_icon::menu::MenuId;
use std::sync::Mutex;

pub struct TrayApp {
    pub _tray_icon: TrayIcon,
    pub connect_id: MenuId,
    pub browser_id: MenuId,
    pub restart_id: MenuId,
    pub quit_id: MenuId,
    port: u16,
    pub shutdown_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

pub fn load_icon(path: &Path) -> Result<Icon, Box<dyn std::error::Error>> {
    let img = image::open(path)?;
    let (width, height) = img.dimensions();
    let rgba = img.into_rgba8().into_raw();
    Ok(Icon::from_rgba(rgba, width, height)?)
}

impl TrayApp {
    pub fn new(port: u16) -> Result<Self, Box<dyn std::error::Error>> {
        let icon_path = Path::new("..").join("public").join("favicon.ico");
        let icon = load_icon(&icon_path).unwrap_or_else(|_| {
            Icon::from_rgba(vec![0; 4 * 16 * 16], 16, 16).unwrap()
        });

        let tray_menu = Menu::new();
        
        let connect_i = MenuItem::new("🔌 Conectar à Mesa", true, None);
        let browser_i = MenuItem::new("🌐 Abrir no Navegador", true, None);
        let restart_i = MenuItem::new("Reiniciar Servidor", true, None);
        let quit_i = MenuItem::new("❌ Sair e Encerrar", true, None);

        let connect_id = connect_i.id().clone();
        let browser_id = browser_i.id().clone();
        let restart_id = restart_i.id().clone();
        let quit_id = quit_i.id().clone();

        let _ = tray_menu.append(&connect_i);
        let _ = tray_menu.append(&browser_i);
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
            browser_id,
            restart_id,
            quit_id,
            port,
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
            let _ = std::process::Command::new("cmd").args(&["/C", "start", &url]).spawn();
            #[cfg(target_os = "macos")]
            let _ = std::process::Command::new("open").arg(&url).spawn();
            #[cfg(target_os = "linux")]
            let _ = std::process::Command::new("xdg-open").arg(&url).spawn();
        } else if event.id == self.connect_id {
            println!("Reconectando à mesa...");
        } else if event.id == self.restart_id {
            println!("Reiniciando servidor...");
            if let Ok(mut tx_guard) = self.shutdown_tx.lock() {
                if let Some(tx) = tx_guard.take() {
                    // Sinaliza shutdown graceful -> o async_main fecha o server,
                    // spawna o novo processo, e so entao retorna
                    let _ = tx.send(());
                    return;
                }
            }
            // Fallback: spawn direto
            let _ = std::process::Command::new(std::env::current_exe().unwrap()).spawn();
            std::process::exit(0);
        }
    }

    #[cfg(target_os = "windows")]
    pub fn run_message_loop(&self) {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            DispatchMessageW, GetMessageW, TranslateMessage, MSG,
        };
        use std::ptr::null_mut;

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
