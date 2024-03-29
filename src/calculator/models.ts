import mongoose, { Schema, model } from "mongoose";

export interface Credibility {
  credibility: number;
}

export interface TextCredibilityWeights {
  weightSpam: number;
  weightBadWords: number;
  weightMisspelling: number;
}

export interface TweetCredibilityWeights extends TextCredibilityWeights {
  weightText: number;
  weightSocial: number;
  weightUser: number;
  weightHistoric: number;
}

export interface TwitterUser {
  verified: boolean;
  yearJoined: number;
  followersCount: number;
  friendsCount: number;
}

export interface Tweet {
  text: Text;
  user: TwitterUser;
}

export interface Text {
  text: string;
  lang: Language;
}
export type Language = "es" | "en" | "fr";

export interface Credibilidad extends mongoose.Document {
  userid: string;
  text: string;
  crediility: string;
}

const CredibilidadSchema = new Schema({
  nombreUsuario: String,
  tweetId: String,
  credibilidad: String,
});

export default model("cat_credibilidades", CredibilidadSchema);
