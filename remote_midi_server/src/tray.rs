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
    pub restart_id: MenuId,
    pub quit_id: MenuId,
    pub shutdown_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

pub fn load_icon(path: &Path) -> Result<Icon, Box<dyn std::error::Error>> {
    let img = image::open(path)?;
    let (width, height) = img.dimensions();
    let rgba = img.into_rgba8().into_raw();
    Ok(Icon::from_rgba(rgba, width, height)?)
}

impl TrayApp {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        // Tenta achar o favicon na pasta public (subindo um nível, pois o server roda em remote_midi_server)
        let icon_path = Path::new("..").join("public").join("favicon.ico");
        let icon = load_icon(&icon_path).unwrap_or_else(|_| {
            Icon::from_rgba(vec![0; 4 * 16 * 16], 16, 16).unwrap()
        });

        let tray_menu = Menu::new();
        
        let restart_i = MenuItem::new("Reiniciar Mini Servidor", true, None);
        let quit_i = MenuItem::new("❌ Sair e Encerrar", true, None);

        let restart_id = restart_i.id().clone();
        let quit_id = quit_i.id().clone();

        let _ = tray_menu.append(&restart_i);
        let _ = tray_menu.append(&PredefinedMenuItem::separator());
        let _ = tray_menu.append(&quit_i);

        let tray_icon = TrayIconBuilder::new()
            .with_menu(Box::new(tray_menu))
            .with_tooltip("01V96 Mini Remote MIDI Server")
            .with_icon(icon)
            .build()?;

        Ok(Self {
            _tray_icon: tray_icon,
            restart_id,
            quit_id,
            shutdown_tx: Mutex::new(None),
        })
    }

    pub fn handle_event(&self) {
        // MenuEvent::receiver().try_recv() é não-bloqueante
        while let Ok(event) = MenuEvent::receiver().try_recv() {
            if event.id == self.quit_id {
                println!("Saindo...");
                std::process::exit(0);
            } else if event.id == self.restart_id {
                println!("Reiniciando mini servidor...");
                if let Ok(mut tx_guard) = self.shutdown_tx.lock() {
                    if let Some(tx) = tx_guard.take() {
                        // Sinaliza o shutdown gracioso no tokio runtime
                        let _ = tx.send(());
                        return;
                    }
                }
                // Fallback: spawn direto se não tiver canal ativo
                let _ = std::process::Command::new(std::env::current_exe().unwrap()).spawn();
                std::process::exit(0);
            }
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
                
                // Processa eventos da bandeja
                self.handle_event();
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn run_message_loop(&self) {
        loop {
            self.handle_event();
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    }
}
