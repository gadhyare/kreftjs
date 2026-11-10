//! Kreft for Zed: starts the Emmet language server for .kreft files.
//! Zed sends the files to it as "html" (see extension.toml), so `ul>li*3` expands in <view>
//! and CSS abbreviations (`m10`, `df`) expand inside <style>.

use std::{env, fs};
use zed_extension_api::{self as zed, Result};

const PACKAGE: &str = "@olrtg/emmet-language-server";
const SERVER: &str = "node_modules/@olrtg/emmet-language-server/dist/index.js";

struct KreftExtension {
    checked: bool,
}

impl KreftExtension {
    fn installed() -> bool {
        fs::metadata(SERVER).is_ok_and(|file| file.is_file())
    }

    /// Installs the server with npm the first time (and when a newer one is out); offline, the installed one is used.
    fn server_path(&mut self, id: &zed::LanguageServerId) -> Result<String> {
        if self.checked && Self::installed() {
            return Ok(SERVER.to_string());
        }
        zed::set_language_server_installation_status(
            id,
            &zed::LanguageServerInstallationStatus::CheckingForUpdate,
        );
        let wanted = zed::npm_package_latest_version(PACKAGE);
        let current = zed::npm_package_installed_version(PACKAGE).unwrap_or(None);
        match wanted {
            Ok(version) if !Self::installed() || current.as_ref() != Some(&version) => {
                zed::set_language_server_installation_status(
                    id,
                    &zed::LanguageServerInstallationStatus::Downloading,
                );
                if let Err(error) = zed::npm_install_package(PACKAGE, &version) {
                    if !Self::installed() {
                        return Err(error);
                    }
                }
            }
            Ok(_) => {}
            Err(error) => {
                if !Self::installed() {
                    return Err(error);
                }
            }
        }
        if !Self::installed() {
            return Err(format!("the npm package {PACKAGE} has no {SERVER}"));
        }
        self.checked = true;
        Ok(SERVER.to_string())
    }
}

impl zed::Extension for KreftExtension {
    fn new() -> Self {
        Self { checked: false }
    }

    fn language_server_command(
        &mut self,
        id: &zed::LanguageServerId,
        _worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        let server = self.server_path(id)?;
        let path = env::current_dir()
            .map_err(|error| error.to_string())?
            .join(server);
        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![path.to_string_lossy().to_string(), "--stdio".to_string()],
            env: Default::default(),
        })
    }
}

zed::register_extension!(KreftExtension);
