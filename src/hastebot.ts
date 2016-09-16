let path = require("path")
let _ = require("lodash")
let Q = require("q")
let Client = require("hangupsjs")

let client = new Client({
    cookiespath: path.resolve(__dirname, "../data/cookies.json"),
    rtokenpath: path.resolve(__dirname, "../data/refreshtoken.txt")
})
//client.loglevel("debug")
let credentials = {
    auth: Client.authStdin
}
let enabledConversations = []

let buildMessage = (text) => {
    let builder = new Client.MessageBuilder()
    let segments = builder
        .text("(((").bold("bot").text("))) " + text)
        .toSegments()
    return segments
}

client.on("chat_message", event => {
    let conversation_id = event.conversation_id.id
    let sender_id = event.sender_id.chat_id
    let user_id = event.self_event_state.user_id.chat_id
    let message_segments = event.chat_message.message_content.segment

    console.log("conversation_id:", conversation_id)
    console.log("sender_id:", sender_id)
    console.log("user_id:", user_id)
    console.log("message segments", message_segments)

    let message = _.chain(message_segments)
        .filter(it => it.type === "TEXT")
        .map(it => it.text)
        .reduce((message, text) => message + text, "")
        .value()
    console.log(message)

    let isAdmin = sender_id === user_id
    let isEnabled = _.includes(enabledConversations, conversation_id)

    if (isAdmin) {
        if (_.startsWith(message, "!bot on")) {
            enabledConversations = _.uniq(_.concat(enabledConversations, conversation_id))
            client.sendchatmessage(conversation_id, buildMessage("is now enabled"))
        }
        else if (_.startsWith(message, "!bot off")) {
            enabledConversations = _.uniq(_.without(enabledConversations, conversation_id))
            client.sendchatmessage(conversation_id, buildMessage("is now disabled"))
        }
    }
    
    let quotes = [
    ]
    if (isEnabled) {
        if (_.startsWith(_.toLower(message), "!quote count")) {
            client.sendchatmessage(conversation_id, buildMessage("has " + quotes.length + " quotes available (0 new quotes pending)"))
        }
        else if (_.startsWith(_.toLower(message), "!quote") || _.startsWith(_.toLower(message), "quote!")) {
            let quote = _.sample(quotes)
            client.sendchatmessage(conversation_id, buildMessage(quote))
        }
    }
})

//client.logout()
client.connect(() => credentials).then(() => {
    console.log("client connected")
    client.getselfinfo().then(event => { 
        let self_entity = event.self_entity.id.chat_id
        console.log("self_entity:", self_entity) 
    })
}).done()