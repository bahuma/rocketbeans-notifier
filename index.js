const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const CronJob = require('cron').CronJob;
const fetch = require('node-fetch');
const moment = require('moment');

const nconf = require('nconf');

nconf.file({file: './config.json'});

app.use(bodyParser.json());
app.use('/', express.static('public'));


app.post('/api/addsubscription', (req, res) => {
    let subscriptions = nconf.get('subscriptions');

    if (subscriptions.indexOf(req.body.token) === -1) {
        subscriptions.push(req.body.token);
    }
    nconf.set('subscriptions', subscriptions);

    nconf.save();
    res.sendStatus(200);
});

app.get('/api/subscribedshows', (req, res) => {
    let showstonotify = nconf.get('showstonotify');
    res.json(showstonotify);
});

app.post('/api/subscribetoshow', (req, res) => {
    let showstonotify = nconf.get('showstonotify');
    showstonotify.push(req.body.show);
    nconf.set('showstonotify', showstonotify);
    nconf.save();

    res.sendStatus(200);
});

app.post('/api/unsubscribetoshow', (req, res) => {
    let showstonotify = nconf.get('showstonotify');
    showstonotify.splice(showstonotify.indexOf(req.body.show), 1);
    nconf.set('showstonotify', showstonotify);
    nconf.save();
    res.sendStatus(200);
});

app.listen(process.env.PORT || 3000, function () {
    console.log('Example app listening on port 3000!');
});

const apiKey = process.env.FCM_API_KEY;

function sendNotification(item){
    let notifiedAbout = nconf.get('notifiedabout');

    if (notifiedAbout.indexOf(item.id) !== -1) {
        console.log('did not send notification because it was already sent');
        return;
    }

    notifiedAbout.push(item.id);
    nconf.set('notifiedabout', notifiedAbout);
    nconf.save();

    let tokens = nconf.get('subscriptions');

    let promises = [];

    tokens.forEach(token => {
        promises.push(fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'post',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': 'key=' + apiKey
            },
            body: JSON.stringify({
                to: token,
                notification: {
                    title: item.title,
                    body: item.topic,
                    icon: 'images/icon-192x192.png',
                    click_action: 'https://www.rocketbeans.tv'
                }
            })
        }))
    });

    Promise.all(promises).then(data => {
        console.log('finished sending push notification to all subscribers');
    })
}

function check() {
    const showsToNotify = nconf.get('showstonotify');

    fetch('http://api.rbtv.rodney.io/api/1.0/schedule/schedule_linear.json')
    // fetch('http://localhost:3000/testdata.json')
        .then(res => res.json())
        .then(data => {
            let nextItem = null;

            data.schedule.forEach(entry => {
                if (nextItem === null && moment(entry.timeStart) > moment()) {
                    nextItem = entry;
                }
            });

            console.log(nextItem);
            console.log(moment(nextItem.timeStart))
            console.log(moment());

            // Differenz zur naechsten sendung in minuten
            let diff = moment(nextItem.timeStart).diff(moment()) / 1000 / 60;
            console.log(diff)

            if (diff < 10) {
                if (showsToNotify.indexOf(nextItem.show) !== -1 && nextItem.type === 'live') {
                    sendNotification(nextItem);
                }
            }




        }).catch(err => console.log(err));
}

// Cronjob
check();
let job = new CronJob('0 */5 * * * *', check, null, true, 'Europe/Berlin');