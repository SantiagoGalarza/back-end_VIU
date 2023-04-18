import express from "express";
import {
  calculateTextCredibility,
  socialCredibility,
  historicalCredibility,
  twitterUserCredibility,
  calculateTweetCredibility,
  scrapperTwitterUserCredibility,
  scrapedSocialCredibility,
  scrapedtweetCredibility,
  twitterUserCredibilityByUsername,
} from "./service";
import { validationResult } from "express-validator";
import { validate, errorMapper } from "./validation";
import { asyncWrap } from "../utils";

const calculatorRoutes = express.Router();

calculatorRoutes.get("/username", function (req, res) {
  res.json({ username: "test" });
});

calculatorRoutes.get(
  "/plain-text",
  validate("calculateTextCredibility"),
  function (req, res) {
    console.log("Los DATOS DEL QUERY SON:  /plain-text ", req.query);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      errorMapper(errors.array());
    }
    res.json(
      calculateTextCredibility(
        {
          text: req.query.text,
          lang: req.query.lang,
        },
        {
          weightBadWords: +req.query.weightBadWords,
          weightMisspelling: +req.query.weightMisspelling,
          weightSpam: +req.query.weightSpam,
        }
      )
    );
  }
);

calculatorRoutes.get(
  "/twitter/user/:username",
  asyncWrap(async function (req, res) {
    /* const errors = validationResult(req);
    if (!errors.isEmpty()) {
      errorMapper(errors.array());
    } */
    res.json(await twitterUserCredibility(req.params.username));
  })
);
calculatorRoutes.get(
  "/twitter/username/:id",
  asyncWrap(async function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      errorMapper(errors.array());
    }

    const response = await twitterUserCredibilityByUsername(req.params.id);
    const objTokenTraduccion = response.map((data) => {
      return {
        id_str: data.id_str,
        full_text: data.full_text,
        created_at: data.created_at,
        lang: "es",
        id_usuario: data.user.id,
      };
    });
    res.json(objTokenTraduccion);
  })
);

calculatorRoutes.get(
  "/user/scrape",
  validate("scrapperTwitterUserCredibility"),
  function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      errorMapper(errors.array());
    }
    const userCredibility = scrapperTwitterUserCredibility(
      req.query.verified === "true",
      Number(req.query.yearJoined)
    );
    res.send(userCredibility);
  }
);

calculatorRoutes.get(
  "/twitter/social/:userId",

  asyncWrap(async function (req, res) {
    /* const errors = validationResult(req);
    if (!errors.isEmpty()) {
      errorMapper(errors.array());
    } */
    const socialCredibilityVal = await socialCredibility(
      req.params.userId,
      +req.query.maxFollowers
    );
    res.send(socialCredibilityVal);
  })
);

calculatorRoutes.get(
  "/twitter/historical/:userId",

  asyncWrap(async function (req, res) {
    /* const errors = validationResult(req);
    if (!errors.isEmpty()) {
      errorMapper(errors.array());
    } */
    const historicalCredibilityVal = await historicalCredibility(
      req.params.userId
    );
    res.send(historicalCredibilityVal);
  })
);


calculatorRoutes.get(
  "/twitter/tweets",
  validate("tweetCredibility"),
  asyncWrap(async function (req, res) {
    console.log("Los DATOS DEL QUERY SON: /twitter/tweets ", req.query);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      errorMapper(errors.array());
    }
    res.json(
      await calculateTweetCredibility(
        req.query.usuario,
        req.query.tweetId,
        req.query.guardar,
        {
          weightBadWords: +req.query.weightBadWords,
          weightMisspelling: +req.query.weightMisspelling,
          weightSpam: +req.query.weightSpam,
          weightSocial: +req.query.weightSocial,
          weightText: +req.query.weightText,
          weightUser: +req.query.weightUser,
          weightHistoric: +req.query.weightHistoric,
        },
        +req.query.maxFollowers
      )
    );
  })
);

/*calculatorRoutes.get(
  "/twitter/tweets1",
  validate("tweetCredibility"),
  asyncWrap(async function (req, res) {
    console.log("Los DATOS DEL QUERY SON: /twitter/tweets ", req.query);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      errorMapper(errors.array());
    }
    res.json(
      await calculateTweetCredibility(
        req.query.usuario,
        req.query.tweetId,
        {
          weightBadWords: +req.query.weightBadWords,
          weightMisspelling: +req.query.weightMisspelling,
          weightSpam: +req.query.weightSpam,
          weightSocial: +req.query.weightSocial,
          weightText: +req.query.weightText,
          weightUser: +req.query.weightUser,
          weightHistoric: +req.query.weightHistoric,
        },
        +req.query.maxFollowers
      )
    );
  })
);*/

calculatorRoutes.get(
  "/social/scrape",
  validate("scrapedSocialCredibility"),
  function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      errorMapper(errors.array());
    }
    res.send(
      scrapedSocialCredibility(
        +req.query.followersCount,
        +req.query.friendsCount,
        +req.query.maxFollowers
      )
    );
  }
);

calculatorRoutes.get(
  "/tweets/scraped",
  validate("scrapedTweetCredibility"),
  function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      errorMapper(errors.array());
    }
    res.json(
      scrapedtweetCredibility(
        {
          text: req.query.tweetText,
          lang: req.query.lang,
        },
        {
          weightSpam: +req.query.weightSpam,
          weightBadWords: +req.query.weightBadWords,
          weightMisspelling: +req.query.weightMisspelling,
          weightText: +req.query.weightText,
          weightUser: +req.query.weightUser,
          weightSocial: +req.query.weightSocial,
          weightHistoric: +req.query.weightHistoric,
        },
        {
          verified: req.query.verified === "true",
          yearJoined: +req.query.yearJoined,
          followersCount: +req.query.followersCount,
          friendsCount: +req.query.friendsCount,
        },
        +req.query.maxFollowers
      )
    );
  }
);

export default calculatorRoutes;
