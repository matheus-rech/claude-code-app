import path from "node:path"
import { BrowserWindow, Menu, ipcMain } from "electron"

// Global reference to main window
let mainWindow: BrowserWindow | null = null

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    tabbingIdentifier: "claude-code-repo-tabs",
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(
      path.join(
        __dirname,
        `../../../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
      ),
    )
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools()
}

// Create new tab function
function createNewTab() {
  const newWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    tabbingIdentifier: "claude-code-repo-tabs",
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    newWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    newWindow.loadFile(
      path.join(
        __dirname,
        `../../../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
      ),
    )
  }

  // Add as a tab to the main window if it exists
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.addTabbedWindow(newWindow)
  }

  return newWindow
}

// Handle new tab creation
ipcMain.handle("create-new-tab", () => {
  return createNewTab()
})

// Handle context menu
ipcMain.handle("show-context-menu", async (event, menuItems: Array<{
  label: string
  action: string
  enabled?: boolean
  type?: "normal" | "separator"
}>) => {
  return new Promise((resolve) => {
    const template = menuItems.map((item): Electron.MenuItemConstructorOptions => {
      if (item.type === "separator") {
        return { type: "separator" as const }
      }

      return {
        label: item.label,
        enabled: item.enabled !== false,
        click: () => {
          // Resolve the promise with the action when clicked
          resolve(item.action)
        },
      }
    })

    const menu = Menu.buildFromTemplate(template)

    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    if (senderWindow) {
      menu.popup({
        window: senderWindow,
        callback: () => {
          // Resolve with null if menu is closed without clicking
          resolve(null)
        },
      })
    } else {
      resolve(null)
    }
  })
})

export { createWindow, createNewTab, mainWindow }
