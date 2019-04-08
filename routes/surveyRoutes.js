const mongoose = require('mongoose');
const requireLogin = require('../middleware/requireLogin');
const minimumCredits = require('../middleware/minimumCredits');
const Mailer = require('../services/Mailer');
const Survey = mongoose.model('surveys');
const surveyTemplate = require('../services/emailTemplates/surveyTemplate');
const _ = require('lodash');
const Path = require('path-parser').default;
const { URL } = require('url');

module.exports = app => {
  app.get('/api/surveys/:surveyId/:choice', (req, res) => {
    res.send('Thanks for voting!');
  });

  app.post('/api/surveys/webhooks', (req, res) => {
    _.chain(req.body)
      .map(({ email, url }) => {
        const p = new Path('/api/surveys/:surveyId/:choice');
        const match = p.test(new URL(url).pathname);
        if (match) {
          return { email, surveyId: match.surveyId, choice: match.choice };
        }
      })
      .compact() // remove null values
      .uniqBy('email', 'surveyId')
      .each(({ surveyId, email, choice }) => {
        Survey.updateOne(
          {
            _id: surveyId,
            recipients: {
              $elemMatch: { email: email, responded: false }
            }
          },
          {
            $inc: { [choice]: 1 },
            $set: { 'recipients.$.responded': true },
            lastResponded: new Data()
          }
        ).exec();
      })
      .value(); // pull out values

    res.send({});
  });

  app.get('/api/surveys', requireLogin, async (req, res) => {
    const surveys = await Survey.find({ _user: req.user.id }).select({
      recipients: false
    });
    res.send(surveys);
  });

  app.post('/api/surveys', requireLogin, minimumCredits, async (req, res) => {
    const { title, subject, body, recipients } = req.body;
    const survey = new Survey({
      title,
      body,
      subject,
      recipients: recipients.split(',').map(email => ({ email: email.trim() })),
      _user: req.user.id,
      dateSent: Date.now()
    });

    const mailer = new Mailer(survey, surveyTemplate(survey));

    try {
      await mailer.send();
      await survey.save();
      req.user.credits -= 1;
      const user = await req.user.save();
      res.send(user);
    } catch (err) {
      res.status(422).send(err);
    }
  });
};
