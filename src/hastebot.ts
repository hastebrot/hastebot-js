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

const RECONNECT_TIMEOUT_MILLIS = 3000

let timestamp = () => new Date().toISOString()

let messenger = new Client({
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
messenger.connect(() => credentials).then(onConnected)

messenger.on("connect_failed", () => {
  Q.Promise((resolve) => setTimeout(resolve, RECONNECT_TIMEOUT_MILLIS)).then(() => {
    console.log(timestamp(), "client reconnecting...")
    messenger.connect(() => credentials).then(onConnected)
  })
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

const COMMAND_BOT = "bot"
const COMMAND_QUOTE = "quote"

const BOT_CONVERSATIONS = "BOT_CONVERSATIONS"
const QUOTES_STORED = "QUOTES_STORED"
const QUOTES_PENDING = "QUOTES_PENDING"

messenger.on("chat_message", event => {
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
  if (isEnabled) {
    console.log(sender_id, JSON.stringify(message))
  }
  
  // hastebotConfig.ts
  if (isAdmin) {
    if (matchCommand(`!${COMMAND_BOT} on`, 
                     `! ${COMMAND_BOT} on`)(message)) {
      store.setItemSync(BOT_CONVERSATIONS,
        _.uniq(_.concat(store.getItemSync(BOT_CONVERSATIONS) || [], conversation_id)))
      messenger.sendchatmessage(conversation_id, buildMessage("is now enabled"))
    }
    else if (matchCommand(`!${COMMAND_BOT} off`, 
                          `! ${COMMAND_BOT} off`)(message)) {
      store.setItemSync(BOT_CONVERSATIONS,
        _.uniq(_.without(store.getItemSync(BOT_CONVERSATIONS) || [], conversation_id)))
      messenger.sendchatmessage(conversation_id, buildMessage("is now disabled"))
    }
  }

  // hastebotQuotes.ts
  if (isEnabled) {
    let quotes = store.getItemSync(QUOTES_STORED) || []
    let quotesPending = store.getItemSync(QUOTES_PENDING) || []

    if (matchCommand(`?${COMMAND_QUOTE}`, 
                     `? ${COMMAND_QUOTE}`, 
                     `${COMMAND_QUOTE}?`, 
                     `!${COMMAND_QUOTE} count`)(message)) {
      messenger.sendchatmessage(conversation_id, buildMessage(
        "has " + quotes.length + " quotes available and " + quotesPending.length + " pending"
      ))
    }
    else if (matchCommand(`!${COMMAND_QUOTE}`, 
                          `! ${COMMAND_QUOTE}`, 
                          `${COMMAND_QUOTE}!`)(message)) {
      let quote = _.sample(quotes)
      messenger.sendchatmessage(conversation_id, buildMessage(quote))
    }
    else if (matchCommand(`${COMMAND_QUOTE}`)(message)) {
      let quote = message
      let quotesPendingNext = _.uniq(_.concat(quotesPending, message))
      if (quotesPending.length !== quotesPendingNext.length) {
        store.setItemSync(QUOTES_PENDING, quotesPendingNext)
        messenger.sendchatmessage(conversation_id, buildMessage(
          "has " + quotesPendingNext.length + " new quotes pending"
        ))
      }
    }
  }
})