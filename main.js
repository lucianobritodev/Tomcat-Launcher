const {
  app,
  Tray,
  Menu,
  dialog
} = require('electron');
const {
  resolve,
  basename
} = require('path');
const {
  spawn,
  spawnSync,
  exec
} = require('child_process');
const notifier = require('node-notifier');
const fs = require('fs');
const Store = require('electron-store');
const Sentry = require('@sentry/electron');

Sentry.init({
  dsn: "https://48cf5547b9314631b530b4752d730314@o1145500.ingest.sentry.io/6337305"
});

const schema = {
  tomcatpaths: {
    type: 'string',
  },
};

let newItem = [];
let mainTray = {};
let locale = {};

if (app.dock) {
  app.dock.hide();
}

const store = new Store({
  schema
});
const SERVER_XML = 'conf/server.xml';

function getLocale() {
  const loc = app.getLocale();

  switch (loc) {
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

  const items = tomcatPaths.map(({
    name,
    path
  }) => ({
    label: name,
    submenu: [{
        label: locale.open,
        click: () => {
          spawn("$(xdg-mime query default inode/directory | sed 's/.desktop//g')", [path], {
            shell: true
          });
        },
      },
      {
        label: locale.browser,
        click: () => {
          let running = checkServerRunning(resolve(path, SERVER_XML));

          if (running) {
            let url = getServerURL(resolve(path, SERVER_XML));
            openInBrowser(url);
          } else {
            showNotifications(2);
          }
        },
      },
      {
        label: locale.log,
        click: () => {
          spawn(`$(xdg-open ${path}/logs/catalina.$(date --rfc-3339=date).log)`, [], {
            shell: true
          });
        },
      },
      {
        type: 'separator',
      },
      {
        label: locale.server,
        click: () => {
          let running = checkServerRunning(resolve(path, SERVER_XML));

          if (running) {
            showNotifications(3);
          } else {
            spawn(`$(xdg-open ${path}/${SERVER_XML})`, [], {
              shell: true
            });
          }

        },
      },
      {
        label: locale.context,
        click: () => {
          let running = checkServerRunning(resolve(path, SERVER_XML));

          if (running) {
            showNotifications(3);
          } else {
            spawn(`$(xdg-open ${path}/conf/context.xml)`, [], {
              shell: true
            });
          }

        },
      },
      {
        type: 'separator',
      },
      {
        label: locale.start,
        click: () => {
          let url = getServerURL(resolve(path, SERVER_XML));
          spawn(`$(sh ${path}/bin/startup.sh)`, [], {
            shell: true
          });
          showNotifications(0);

          setTimeout(() => {
            if (checkServerRunning(resolve(path, SERVER_XML))) {
              showNotifications(1);
              openInBrowser(url);
            } else {
              showNotifications(2);
            }
          }, 6000);

        },
      },
      {
        label: locale.stop,
        click: () => {
          spawn(`$(sh ${path}/bin/shutdown.sh)`, [], {
            shell: true
          });
          showNotifications(0);

          setTimeout(() => {
            if (checkServerRunning(resolve(path, SERVER_XML))) {
              showNotifications(1);
            } else {
              showNotifications(2);
            }
          }, 4000);

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

  const contextMenu = Menu.buildFromTemplate([{
      label: locale.add,
      click: () => {

        newItem = dialog.showOpenDialogSync({
          properties: ['openDirectory']
        });

        if (!newItem) return;
        const [path] = newItem;
        const verifyCatalina = spawnSync(`test -e ${path}/bin/catalina.sh && echo $?`, [],  {
          shell: true
        });

        const catalina = parseInt(String(verifyCatalina.output).replaceAll(',','').replaceAll('\n',''));
        if(catalina != NaN && catalina == 0) {
          const verifyCount = spawnSync(
            `ls -hog ${path}/bin/ | grep ".*.sh$" | egrep -v ^"-rwx" | wc --line`,
            [],
            {shell: true}
          );

          const count = parseInt(String(verifyCount.output).replaceAll(',','').replaceAll('\n',''));
          if(count > 0) showNotifications(4);

          const name = basename(path);

          store.set('tomcatpaths', JSON.stringify([
            ...tomcatPaths,
            {
              path,
              name,
            },
          ]));

          render();
        } else {
          showNotifications(5);
        }
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
  tray.on('click', tray.popUpContextMenu);
}

function openInBrowser(url) {
  spawn(`$(xdg-open ${url})`, [], {
    shell: true
  });
}

/**
 * Show notifications method
 * 
 * num 0 to show await process message.
 * num 1 to show start server success message.
 * num 2 to show stop server warning message.
 * num 3 to show alert-to-stop server warning message.
 * default to show error message.
 * 
 * @param {number} num
 */
function showNotifications(num) {
  switch (num) {
    case 0:
      launchNotification("default", "icon.png");
      break;
    case 1:
      launchNotification("start", "success.png");
      break;
    case 2:
      launchNotification("stop", "warning.png");
      break;
    case 3:
      launchNotification("alert-to-stop", "warning.png");
      break;
    case 4:
      launchNotification("no-execution-permission", "warning.png");
      break;
    case 5:
      launchNotification("no-tomcat-path", "error.png");
      break;
    default:
      launchNotification("error", "error.png");
      break;
  }
}

function launchNotification(type, iconName) {

  let title = locale.notifier[type].title
  let message = locale.notifier[type].message
  iconName = resolve(__dirname, 'assets', 'icons', iconName)

  return notifier.notify({
    title: title,
    message: message,
    wait: true,
    time: 5000,
    timeout: false,
    icon: iconName
  });

}

function getServerURL(path) {
  let url = ""

  const regExpHost = /\s?\t?<Host.*name=.*/g;
  const regExpPort = /\s?\t?<Connector.*protocol=\"HTTP.*\"/g;

  const data = fs.readFileSync(path, {
    encoding: 'utf8',
    flag: 'r'
  });

  if (regExpHost.test(data)) {
    let text = data.match(regExpHost);
    url += 'http://' + text.join('').split('="')[1].split('"')[0].trim();
  }

  if (regExpPort.test(data) && url != "") {
    let text = data.match(regExpPort);
    url += ':' + text.join('').split('port="')[1].split('"')[0].trim() + '/';
  } else {
    url = "http://localhost:8080/"
  }

  return url;
}

function checkServerRunning(path) {
  const regExpPort = /\s?\t?<Server.*shutdown=\"SHUTDOWN\"/g;
  const data = fs.readFileSync(path, {
    encoding: 'utf8',
    flag: 'r'
  });
  let port = "";

  if (regExpPort.test(data)) {
    let text = data.match(regExpPort);
    port += text.join('').split('port="')[1].split('"')[0].trim();
  }

  let run = spawnSync(`lsof -i | grep "${port}"`, [], {
    shell: true
  });

  return String(run.output).includes(port);
}

app.whenReady().then(() => {

  mainTray = new Tray(resolve(__dirname, 'assets', 'icons', 'IconTemplate.png'));
  render(mainTray);

});