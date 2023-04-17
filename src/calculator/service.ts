import {
  TextCredibilityWeights,
  Credibility,
  TwitterUser,
  TweetCredibilityWeights,
  Tweet,
  Text,
} from "./models";
import config from "../config";
import Twit from "twit";
import NSpell from "nspell";
import wash from "washyourmouthoutwithsoap";
import SimpleSpamFilter, { SimpleSpamFilterParams } from "./spam-filter";
import fs from "fs";
import { performance } from "perf_hooks";
import path from "path";
import emojiStrip from "emoji-strip";
import { TwitterApi } from "twitter-api-v2";
import("../views/database");
import moment from "moment";

import CredibilidadModelo, { Credibilidad } from "./models";
import { mongodb } from "../views/keys";
import mongoose, { mongo } from "mongoose";

// Instantiate with desired auth type (here's Bearer v2 auth)
const twitterClient = new TwitterApi({
  appKey: config.TWITTER_CONSUMER_KEY,
  appSecret: config.TWITTER_CONSUMER_SECRET,
});

console.log(config.TWITTER_CONSUMER_KEY, config.TWITTER_CONSUMER_SECRET);
// Tell typescript it's a readonly app
const readOnlyClient = twitterClient.readOnly;

const enDictionaryBase = require.resolve("dictionary-en-us");
const frDictionaryBase = require.resolve("dictionary-fr");
const esDictionaryBase = require.resolve("dictionary-es");

const dictionaries = {
  en: {
    aff: fs.readFileSync(
      path.join(enDictionaryBase, "..", "index.aff"),
      "utf-8"
    ),
    dic: fs.readFileSync(
      path.join(enDictionaryBase, "..", "index.dic"),
      "utf-8"
    ),
  },
  fr: {
    aff: fs.readFileSync(
      path.join(frDictionaryBase, "..", "index.aff"),
      "utf-8"
    ),
    dic: fs.readFileSync(
      path.join(frDictionaryBase, "..", "index.dic"),
      "utf-8"
    ),
  },
  es: {
    aff: fs.readFileSync(
      path.join(esDictionaryBase, "..", "index.aff"),
      "utf-8"
    ),
    dic: fs.readFileSync(
      path.join(esDictionaryBase, "..", "index.dic"),
      "utf-8"
    ),
  },
};

const spellingCheckers = {
  en: new NSpell(dictionaries.en.aff, dictionaries.en.dic),
  es: new NSpell(dictionaries.es.aff, dictionaries.es.dic),
  fr: new NSpell(dictionaries.fr.aff, dictionaries.fr.dic),
};

function responseToTwitterUser(response: any): TwitterUser {
  return {
    verified: response.verified,
    yearJoined: response.created_at.split(" ").pop(),
    followersCount: response.followers_count,
    friendsCount: response.friends_count,
  };
}

function responseToTweet(response: any): Tweet {
  return {
    text: {
      text: response.full_text,
      lang: Object.keys(spellingCheckers).includes(response.lang)
        ? response.lang
        : "en",
    },
    user: responseToTwitterUser(response.user),
  };
}

function buildTwitClient(): Twit {
  return new Twit({
    consumer_key: config.TWITTER_CONSUMER_KEY,
    consumer_secret: config.TWITTER_CONSUMER_SECRET,
    app_only_auth: true,
  });
}

function getCleanedWords(text: string): string[] {
  return text.replace(/ \s+/g, " ").split(" ");
}

function isBadWord(word: string): boolean {
  return Object.keys(spellingCheckers).some((lang) => wash.check(lang, word));
}

function getBadWords(words: string[]): string[] {
  return words.filter(isBadWord);
}

function removeURL(text: string) {
  return text.replace(/(https?:\/\/[^\s]+)/g, "");
}

function removeMention(text: string) {
  return text.replace(/\B@[a-z0-9_-]+\s/gi, "");
}

function removePunctuation(text: string): string {
  return text.replace(
    /(~|`|!|@|#|$|%|^|&|\*|\(|\)|{|}|\[|\]|;|:|"|'|<|,|\.|>|\?|\/|\\|\||-|_|\+|=)/g,
    ""
  );
}

function removeHashtag(text: string) {
  return text
    .split(" ")
    .filter((word) => !(/^#/.test(word) || /#$/.test(word)))
    .join(" ");
}

function removeEmoji(text: string) {
  return emojiStrip(text);
}

function cleanText(text: string): string {
  return removePunctuation(
    removeEmoji(removeHashtag(removeMention(removeURL(text))))
  );
}

function badWordsCriteria(text: string): number {
  const cleanedText = cleanText(text);
  const wordsInText = getCleanedWords(cleanedText);
  const badWordsInText = getBadWords(wordsInText);
  return 100 - (100 * badWordsInText.length) / wordsInText.length;
}

function spamCriteria(text: Text): number {
  const spamParams: SimpleSpamFilterParams = {
    minWords: 5,
    maxPercentCaps: 30,
    maxNumSwearWords: 2,
    lang: text.lang,
  };
  const spamFilter: SimpleSpamFilter = new SimpleSpamFilter(spamParams);
  const cleanedText = cleanText(text.text);
  return spamFilter.isSpam(cleanedText) ? 0 : 100;
}

function missSpellingCriteria(text: Text): number {
  const cleanedText = cleanText(text.text);
  const wordsInText = getCleanedWords(cleanedText);
  const spellingChecker = spellingCheckers[text.lang];
  const numOfMissSpells: number = wordsInText
    .filter((word) => isNaN(+word))
    .reduce((acc, curr) => (spellingChecker.correct(curr) ? acc : acc + 1), 0);
  return 100 - (100 * numOfMissSpells) / wordsInText.length;
}

function calculateTextCredibility(
  text: Text,
  params: TextCredibilityWeights
): Credibility {
  const start = performance.now();
  const badWordsCalculation =
    params.weightBadWords * badWordsCriteria(text.text);
  const spamCalculation = params.weightSpam * spamCriteria(text);
  const missSpellingCalculation =
    params.weightMisspelling * missSpellingCriteria(text);
  const credibility =
    badWordsCalculation + spamCalculation + missSpellingCalculation;
  const end = performance.now();
  console.log(
    JSON.stringify({
      time: end - start,
      metric: "TEXT_CREDIBILITY",
    })
  );

  return { credibility };
}

async function getUserInfo(userId: string) {
  // devolver
  // verified: boolean - tenemos
  // yearJoined: number - quemado 2006
  // followersCount: number
  // friendsCount: number
  try {
    //const variables = await readOnlyClient.v1.user(userId);
    // const foundUsers = await readOnlyClient.v1.searchUsers("fizzvr");
    const foundUsers = await readOnlyClient.v1.user({ screen_name: userId });
    /*     const fetchedInfo = foundUsers.users; */
    ////console.log('data completa', foundUsers);
    let construccion = {
      verified: foundUsers.verified,
      yearJoined: moment(foundUsers.created_at).format("YYYY"),
      followersCount: foundUsers.followers_count,
      friendsCount: foundUsers.friends_count,
    };
    ////console.log(construccion);
    return construccion;
  } catch (error) {
    console.log(error);
  }

  /*   const client = buildTwitClient()
  try {
    const response = await client.get('users/show', { user_id: userId })
    return responseToTwitterUser(response.data)
  } catch (e) {
    console.log(e)
    throw e
  } */
}

async function getUserInfoUsername(userId: string) {
  try {
    const userTimeline = await readOnlyClient.v1.userTimelineByUsername(userId);
    const fetchedTweets = userTimeline.tweets;

    const first3Tweets = fetchedTweets.slice(0, 3);

    //const foundUsers = await readOnlyClient.v1.searchUsers(userId);
    //console.log('user', foundUsers);
    return first3Tweets;
  } catch (e) {
    console.log(e);
    throw e;
  }
}

async function getTweetInfo(tweetId: string): Promise<Tweet> {
  const DEBUG_TWEET_TWITTER_API_TIME_LABEL =
    "Time spent calling the Twitter API\
  to get tweet info - " + Math.random();

  console.time(DEBUG_TWEET_TWITTER_API_TIME_LABEL);
  const client = buildTwitClient();

  try {
    const response = await client.get("statuses/show", {
      id: tweetId,
      tweet_mode: "extended",
    });
    console.timeEnd(DEBUG_TWEET_TWITTER_API_TIME_LABEL);

    return responseToTweet(response.data);
  } catch (e) {
    console.log(e);
    console.timeEnd(DEBUG_TWEET_TWITTER_API_TIME_LABEL);
    throw e;
  }
}

function calculateUserCredibility(user: any) {
  return getVerifWeight(user.verified) + getCreationWeight(user.yearJoined);
}

function calculateSocialCredibility(user: any, maxFollowers: number): number {
  const followersImpactCalc = followersImpact(
    user.followersCount,
    maxFollowers
  );
  ////console.log('aca si llega:', user.friendsCount);
  const ffProportionCalc = ffProportion(user.followersCount, user.friendsCount);
  ////console.log('valor:', Math.min(100, followersImpactCalc + ffProportionCalc));
  return Math.min(100, followersImpactCalc + ffProportionCalc);
}

async function twitterUserCredibility(userId: string) {
  // verified: boolean - tenemos
  // yearJoined: number - quemado 2006
  // followersCount: number
  // friendsCount: number
  return getUserInfo(userId).then((response) => {
    return {
      credibility: calculateUserCredibility(response),
    };
  });
}

async function calculateHistoricalCredibility(userID: string) {
  const allTweets = await CredibilidadModelo.find({ nombreUsuario: userID });
  console.log('allTweets', allTweets);
  const cuantosTweets = allTweets.length;
  console.log('cuantosTweets', cuantosTweets);
  let credibilidadTotal = 0;
  allTweets.forEach((tweet) => {
    credibilidadTotal += Number(tweet.credibilidad);
  });
  let total = 0;
  total = credibilidadTotal / cuantosTweets;
  console.log('total', total);

  return total ? total : 0;
}

async function twitterUserCredibilityByUsername(userId: string) {
  return getUserInfoUsername(userId).then((response) => {
    return response;
  });
}

function scrapperTwitterUserCredibility(
  verified: boolean,
  accountCreationYear: number
): Credibility {
  const user: TwitterUser = {
    verified: verified,
    yearJoined: accountCreationYear,
    followersCount: 0,
    friendsCount: 0,
  };
  return {
    credibility: calculateUserCredibility(user),
  };
}

async function calculateTweetCredibility(
  usuario: string,
  tweetId: string,
  params: TweetCredibilityWeights,
  maxFollowers: number
): Promise<Credibility> {
  console.log("tweetId", tweetId);
  console.log("EL usuario", usuario);
  try {
    const tweet: Tweet = await getTweetInfo(tweetId);
    const user: TwitterUser = tweet.user;
    const nombreUsuario = usuario;
    const userCredibility: number =
      calculateUserCredibility(user) * params.weightUser;
    const textCredibility: number =
      calculateTextCredibility(tweet.text, params).credibility * params.weightText;
    const socialCredibility: number =
      calculateSocialCredibility(user, maxFollowers) * params.weightSocial;
    const historico = await calculateHistoricalCredibility(usuario);
    const historicCredibility = historico * params.weightHistoric;

    const credibilidad = userCredibility + textCredibility + socialCredibility + historicCredibility;

    const CredibilidadAGuardar = new CredibilidadModelo({
      nombreUsuario,
      tweetId,
      credibilidad,
    });

    CredibilidadAGuardar.save();

    console.log("guardado correctamente en MongoDB");

    return {
      credibility: userCredibility + textCredibility + socialCredibility,
    };
  } catch (e) {
    console.log(e);
    throw e;
  }
}

function getVerifWeight(isUserVerified: boolean): number {
  if (isUserVerified) {
    return 50;
  } else {
    return 0;
  }
}

function getCreationWeight(yearJoined: number): number {
  const currentYear = new Date().getFullYear();
  const twitterCreationYear = 2006;
  const maxAccountAge = currentYear - twitterCreationYear;
  const accountAge = currentYear - yearJoined;
  return 50 * (accountAge / maxAccountAge);
}

function followersImpact(userFollowers: number, maxFollowers: number): number {
  if (maxFollowers === 0) {
    return 0;
  } else {
    return (userFollowers / maxFollowers) * 50;
  }
}

function ffProportion(userFollowers: number, userFollowing: number): number {
  if (userFollowers === 0 && userFollowing === 0) {
    return 0;
  } else {
   //// console.log('seguidores c', userFollowing)
    return (userFollowers / (userFollowers + userFollowing)) * 50;
  }
}

async function socialCredibility(userID: string, maxFollowers: number) {
  const response = await getUserInfo(userID);
  ////console.log("es la ultima response", response);
  return {
    credibility: calculateSocialCredibility(response, maxFollowers),
  };
}

async function historicalCredibility(userID: string) {
  //buscar en mongodb 
  const allTweets = await CredibilidadModelo.find({ nombreUsuario: userID });
  let cuantosTweets = allTweets.length;
  let credibilidadTotal = 0;
  allTweets.forEach((tweet) => {
    credibilidadTotal += Number(tweet.credibilidad);
  });
  let total = 0;
  total = credibilidadTotal / cuantosTweets;

  return {
    credibility: total
  };
}

function scrapedtweetCredibility(
  tweetText: Text,
  tweetCredibilityWeights: TweetCredibilityWeights,
  twitterUser: TwitterUser,
  maxFollowers: number
) {
  const userCredibility: number =
    calculateUserCredibility(twitterUser) * tweetCredibilityWeights.weightUser;
  const textCredibility: number =
    calculateTextCredibility(tweetText, tweetCredibilityWeights).credibility *
    tweetCredibilityWeights.weightText;
  const socialCredibility: number =
    calculateSocialCredibility(twitterUser, maxFollowers) *
    tweetCredibilityWeights.weightSocial;
  return {
    credibility: userCredibility + textCredibility + socialCredibility,
  };
}

function scrapedSocialCredibility(
  followersCount: number,
  friendsCount: number,
  maxFollowers: number
) {
  const user: TwitterUser = {
    verified: false,
    yearJoined: 2018,
    followersCount: followersCount,
    friendsCount: friendsCount,
  };
  return {
    credibility: calculateSocialCredibility(user, maxFollowers),
  };
}

export {
  calculateTextCredibility,
  twitterUserCredibility,
  calculateTweetCredibility,
  socialCredibility,
  historicalCredibility,
  scrapperTwitterUserCredibility,
  scrapedSocialCredibility,
  scrapedtweetCredibility,
  removeHashtag,
  twitterUserCredibilityByUsername,
};
