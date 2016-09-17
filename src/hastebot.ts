//-------------------------------------------------------------------------------------------------
// IMPORTS.
//-------------------------------------------------------------------------------------------------

import * as path from "path"
import * as _ from "lodash"
import * as Q from "q"

let Client = require("hangupsjs")
let storage = require("node-persist")

//-------------------------------------------------------------------------------------------------
// CONNECTIONS.
//-------------------------------------------------------------------------------------------------

let timestamp = () => new Date().toISOString()

let client = new Client({
  cookiespath: path.resolve(__dirname, "../data/cookies.json"),
  rtokenpath: path.resolve(__dirname, "../data/refreshtoken.txt")
})

let store = storage
store.initSync({
  dir: path.resolve(__dirname, "../data/store")
})

//client.loglevel("info")
//client.logout()
store.persistSync()

let credentials = {
  auth: Client.authStdin
}

let onConnected = () => {
  console.log(timestamp(), "client connected")
  //client.getselfinfo().then(event => {
  //  let self_entity = event.self_entity.id.chat_id
  //  console.log("self_entity:", self_entity)
  //})
}

console.log(timestamp(), "client connecting...")
client.connect(() => credentials).then(onConnected)

client.on("connect_failed", () => {
  Q.Promise((resolve) => setTimeout(resolve, 3000)).then(() => {
    console.log(timestamp(), "client reconnecting...")
    client.connect(() => credentials).then(onConnected)
  });
})

//-------------------------------------------------------------------------------------------------
// MESSAGES.
//-------------------------------------------------------------------------------------------------

let buildMessage = (text) => {
  let builder = new Client.MessageBuilder()
  let segments = builder
    .text("(((").bold("bot").text("))) " + text)
    .toSegments()
  return segments
}

let readMessageText = (segments) => {
  return _.chain(segments)
    .filter(it => it.type === "TEXT" || it.type === "LINE_BREAK")
    .map(it => it.text)
    .reduce((message, text) => message + text, "")
    .value()
}

let matchCommand = (...commands) => {
  return (message) => _.some(commands, (command) => _.startsWith(command, "!") ?
    _.toLower(_.trim(message)) === command : _.startsWith(_.toLower(_.trim(message)), command))
}

const BOT_CONVERSATIONS = "BOT_CONVERSATIONS"
const QUOTES_STORED = "QUOTES_STORED"
const QUOTES_PENDING = "QUOTES_PENDING"

client.on("chat_message", event => {
  let self_user_id = event.self_event_state.user_id.chat_id
  let conversation_id = event.conversation_id.id
  let sender_id = event.sender_id.chat_id
  let message_segments = event.chat_message.message_content.segment

  let isAdmin = sender_id === self_user_id
  let isDebug = false
  let isEnabled = _.includes(store.getItemSync(BOT_CONVERSATIONS) || [], conversation_id)

  // hastebotDebug.ts
  if (isDebug) {
    console.log("self_user_id:", self_user_id)
    console.log("conversation_id:", conversation_id)
    console.log("sender_id:", sender_id)
    console.log("message segments", message_segments)
  }

  let message = readMessageText(message_segments)
  console.log(sender_id, JSON.stringify(message))
  
  // hastebotConfig.ts
  if (isAdmin) {
    if (matchCommand("!bot on")(message)) {
      store.setItemSync(BOT_CONVERSATIONS, 
        _.uniq(_.concat(store.getItemSync(BOT_CONVERSATIONS) || [], conversation_id)))
      client.sendchatmessage(conversation_id, buildMessage("is now enabled"))
    }
    else if (matchCommand("!bot off")(message)) {
      store.setItemSync(BOT_CONVERSATIONS, 
        _.uniq(_.without(store.getItemSync(BOT_CONVERSATIONS) || [], conversation_id)))
      client.sendchatmessage(conversation_id, buildMessage("is now disabled"))
    }
  }

  // hastebotQuotes.ts
  if (isEnabled) {
    let quotes = store.getItemSync(QUOTES_STORED) || []
    let quotesPending = store.getItemSync(QUOTES_PENDING) || []

    if (matchCommand("!quote count")(message)) {
      client.sendchatmessage(conversation_id, buildMessage(
        "has " + quotes.length + " quotes available and " + quotesPending.length + " pending"
      ))
    }
    else if (matchCommand("!quote", "quote!")(message)) {
      let quote = _.sample(quotes)
      client.sendchatmessage(conversation_id, buildMessage(quote))
    }
    else if (matchCommand("quote")(message)) {
      let quote = message
      store.setItemSync(QUOTES_PENDING, _.concat(store.getItemSync(QUOTES_PENDING) || [], message))
      client.sendchatmessage(conversation_id, buildMessage(
        "has " + quotes.length + " quotes available and " + (quotesPending.length + 1) + " pending"
      ))
    }
  }
})