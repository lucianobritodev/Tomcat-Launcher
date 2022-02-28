const { app, Tray, nativeImage, Menu, dialog } = require('electron');
const { resolve, basename } = require('path');
const { spawn } = require('child_process');
const notifier = require('node-notifier');
const fs = require('fs');
const Store = require('electron-store');
const Sentry = require ('@sentry/electron');

Sentry.init({ dsn: "https://5466675ecb1347d3a79052aad3a950ef@o1145500.ingest.sentry.io/6213487" });

const schema = {
  tomcatpaths: {
    type: 'string',
  },
};

const store = new Store({ schema });

let newItem = [];
let mainTray = {};
let locale = {};

function getLocale() {
  const locale = app.getLocale();

  switch (locale) {
    case 'es-419' || 'es':
      return JSON.parse(fs.readFileSync(resolve(__dirname, 'locale/es.json')));
    case 'pt-BR' || 'pt-PT':
      return JSON.parse(fs.readFileSync(resolve(__dirname, 'locale/pt.json')));
    default:
      return JSON.parse(fs.readFileSync(resolve(__dirname, 'locale/en.json')));
  }
  }

function render(tray = mainTray) {
  const storedTomcatPaths = store.get('tomcatpaths');
  const tomcatPaths = storedTomcatPaths ? JSON.parse(storedTomcatPaths) : [];
  locale = getLocale();

  const items = tomcatPaths.map(({ name, path }) => ({
    label: name,
    submenu: [
      {
        label: locale.open,
        click: () => {
          spawn("$(xdg-mime query default inode/directory | sed 's/.desktop//g')", [path], { shell: true });
        },
      },
      {
        label: locale.log,
        click: () => {
          spawn(`$(xdg-open ${path}/logs/catalina.$(date --rfc-3339=date).log)`, [], { shell: true });
        },
      },
      {
        label: locale.server,
        click: () => {
            spawn(`$(xdg-open ${path}/conf/server.xml)`, [], { shell: true });
        },
      },
      {
        label: locale.context,
        click: () => {
          spawn(`$(xdg-open ${path}/conf/context.xml)`, [], { shell: true });
        },
      },
      {
        label: locale.start,
        click: () => {
          spawn(`$(bash ${path}/bin/startup.sh)`, [], { shell: true });
          showNotifications(1);
        },
      },
      {
        label: locale.stop,
        click: () => {
            spawn(`$(bash ${path}/bin/shutdown.sh)`, [], { shell: true });
            showNotifications(2);
        }
      },
      {
        label: locale.remove,
        click: () => {
          store.set('tomcatpaths', JSON.stringify(tomcatPaths.filter(item => item.path !== path)));
          render();
        },
      },
    ],
  }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: locale.add,
      click: () => {
        newItem = dialog.showOpenDialogSync({ properties: ['openDirectory'] });

        if (!newItem) return;

        const [ path ] = newItem;
        const name = basename(path);

        store.set('tomcatpaths', JSON.stringify(
          [
            ...tomcatPaths,
            {
                path,
                name,
            },
          ]
        ));

        render();
      },
    },
    {
      type: 'separator',
    },
    ...items,
    {
      type: 'separator',
    },
    {
      type: 'normal',
      label: locale.close,
      role: 'quit',
      enabled: true,
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(locale.tooltip);
  tray.on('click', tray.popUpContextMenu);
}

function showNotifications(num) {
  switch (num) {
    case 1:
      startTomcat();
      break;
    case 2:
      stopTomcat();
      break;
    default:
      errorTomcat();
      break;
  }
}

function startTomcat() {
  return notifier.notify({
    title: locale.notifier.start.title,
    message: locale.notifier.start.message,
    wait: true,
    timeout: false,
    icon: resolve(__dirname, 'assets/icon.png')
  });
}

function stopTomcat() {
  return notifier.notify({
    title: locale.notifier.stop.title,
    message: locale.notifier.stop.message,
    wait: true,
    timeout: false,
    icon: resolve(__dirname, 'assets/icon.png')
  });
}

function errorTomcat() {
  return notifier.notify({
    title: locale.notifier.error.title,
    message: locale.notifier.error.message,
    wait: true,
    timeout: false,
    icon: resolve(__dirname, 'assets/icon.png')
  });
}

//app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(() => {

  mainTray = new Tray(nativeImage.createFromPath('assets/IconTemplate.png'));
  render(mainTray);

});
