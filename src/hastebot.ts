//-------------------------------------------------------------------------------------------------
// IMPORTS.
//-------------------------------------------------------------------------------------------------

import * as path from "path"
import * as _ from "lodash"
import * as Q from "q"
import * as moment from "moment"

let Client = require("hangupsjs")
let storage = require("node-persist")
let humanizeDuration = require("humanize-duration")

//-------------------------------------------------------------------------------------------------
// CONNECTIONS.
//-------------------------------------------------------------------------------------------------

const DEBUG_MODE = false
const RECONNECT_TIMEOUT_MILLIS = 3000

let timestamp = () => `<${moment().format("YYYY-MM-DD HH:mm:ss")}>`
let duration = (start: moment.Moment) => `(${moment().diff(start, "ms")} ms)`

let messenger = new Client({
  cookiespath: path.resolve(__dirname, "../data/cookies.json"),
  rtokenpath: path.resolve(__dirname, "../data/refreshtoken.txt")
})

let store = storage
store.initSync({
  dir: path.resolve(__dirname, "../data/store")
})

// messenger.loglevel("info")
if (_.includes(process.argv, "--logout")) {
  messenger.logout()
}
store.persistSync()

let credentials = {
  auth: Client.authStdin
}

let connectMessenger = (messenger) => {
  console.log(timestamp(), "messenger connecting...")
  let context = {timestamp: moment()}
  messenger.connect(() => credentials).then(() => onMessengerConnected(context))
}

let reconnectMessenger = (messenger) => {
  Q.Promise((resolve) => setTimeout(resolve, RECONNECT_TIMEOUT_MILLIS)).then(() => {
    console.log(timestamp(), "messenger reconnecting...")
    let context = {timestamp: moment()}
    messenger.connect(() => credentials).then(() => onMessengerConnected(context))
  })
}

let onMessengerConnected = (context) => {
  console.log(timestamp(), "messenger connected", duration(context.timestamp))
}

connectMessenger(messenger)
messenger.on("connect_failed", () => reconnectMessenger(messenger))

//-------------------------------------------------------------------------------------------------
// MESSAGES.
//-------------------------------------------------------------------------------------------------

const COMMAND_BOT = "bot"
const COMMAND_QUOTE = "quote"

const BOT_CONVERSATIONS = "BOT_CONVERSATIONS"
const QUOTES_STORED = "QUOTES_STORED"
const QUOTES_PENDING = "QUOTES_PENDING"

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

let onMessage = (event, context) => { 
  let isAdmin = context.sender_id === context.self_user_id
  let isDebug = context.is_debug
  let isEnabled = _.includes(store.getItemSync(BOT_CONVERSATIONS) || [], context.conversation_id)

  let message = readMessageText(context.message_segments)
  
  // hastebotConfig.ts
  if (isAdmin) {
    if (matchCommand(`!${COMMAND_BOT} on`, 
                     `! ${COMMAND_BOT} on`)(message)) {
      store.setItemSync(BOT_CONVERSATIONS,
        _.uniq(_.concat(store.getItemSync(BOT_CONVERSATIONS) || [], context.conversation_id)))
      messenger.sendchatmessage(context.conversation_id, buildMessage("is now enabled."))
      isEnabled = true
    }
    else if (matchCommand(`!${COMMAND_BOT} off`, 
                          `! ${COMMAND_BOT} off`)(message)) {
      store.setItemSync(BOT_CONVERSATIONS,
        _.uniq(_.without(store.getItemSync(BOT_CONVERSATIONS) || [], context.conversation_id)))
      messenger.sendchatmessage(context.conversation_id, buildMessage("is now disabled."))
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
      messenger.sendchatmessage(context.conversation_id, buildMessage(
        "has " + quotes.length + " quotes available and " + quotesPending.length + " pending."
      ))
    }
    else if (matchCommand(`!${COMMAND_QUOTE}`, 
                          `! ${COMMAND_QUOTE}`, 
                          `${COMMAND_QUOTE}!`)(message)) {
      let quote = _.sample(quotes)
      messenger.sendchatmessage(context.conversation_id, buildMessage(quote))
    }
    else if (matchCommand(`${COMMAND_QUOTE}`)(message)) {
      let quote = message
      let quotesPendingNext = _.uniq(_.concat(quotesPending, message))
      if (quotesPending.length !== quotesPendingNext.length) {
        store.setItemSync(QUOTES_PENDING, quotesPendingNext)
        messenger.sendchatmessage(context.conversation_id, buildMessage(
          "has " + quotesPendingNext.length + " new quotes pending."
        ))
      }
    }
    
    else if (matchCommand(`!time`, "time!")(message)) {
      let arrival = moment("2017-01-01T00:00:00+0200")
      let duration = arrival.diff(moment())
      // let durationText = moment.duration(duration).humanize()
      let durationText = humanizeDuration(moment.duration(duration).asMilliseconds(), {
        units: ["d", "h"],
        round: true,
        conjunction: " and ",
        serialComma: false
      })
      messenger.sendchatmessage(context.conversation_id, buildMessage(
        durationText + " left until new year."
      ))
    }
  }
  
  if (isEnabled) {
    console.log(timestamp(), JSON.stringify(message), duration(context.timestamp))
  }
}

messenger.on("chat_message", event => {
  let context = {
    self_user_id: event.self_event_state.user_id.chat_id,
    conversation_id: event.conversation_id.id,
    sender_id: event.sender_id.chat_id,
    message_segments: event.chat_message.message_content.segment,
    is_debug: DEBUG_MODE,
    timestamp: moment()
  }

  // hastebotDebug.ts
  if (context.is_debug) {
    console.log("self_user_id:", context.self_user_id)
    console.log("conversation_id:", context.conversation_id)
    console.log("sender_id:", context.sender_id)
    console.log("message segments", context.message_segments)
  }

  onMessage(event, context)
})
