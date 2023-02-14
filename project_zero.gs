/***
 * v17: 
 * Fixing Bug related to using Sender Name instead of Email as the key 
 * (in progress)
 */
function test_delete_logic(){
  const parameter = 'from:'+ 'fabletics@emails.fabletics.com '
  const messageList = Gmail.Users.Messages.list('me', {
    q: parameter,
    pageToken: null,
    maxResults: 500,
  })
  Logger.log(messageList)

  function update_properties(){
  // grab current properties
  const userProperties = PropertiesService.getUserProperties();
  
  // grab all new (1 day old) messages with unsubscribe 
  const parameter = '+unsubscribe'+ '  newer_than:1d'
  const newmessage_list = Gmail.Users.Messages.list('me', {
    q: parameter,
    pageToken: null,
    maxResults: 500,
  })
  // Logger.log(newmessage_list)

  // update userProperties if any new
  const new_messages = newmessage_list.messages
  if (new_messages){
    const sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))

    const updated_data = batchMessages(new_messages, sender_data)
    // Logger.log(updated_data.entries())
    const property_data = JSON.stringify(Array.from(updated_data.entries()));

    userProperties.setProperty('sender_data', property_data);
  }
}

function search(e){
  var input = e.formInput.search
  // Logger.log(input)

  if (input!=null){
    const userProperties = PropertiesService.getUserProperties();
    // Logger.log(userProperties.getProperties())

    // create a card 
    var card = CardService.newCardBuilder()

    // create search bar 
    card.addSection(create_searchbar(input))

    var search_results = CardService.newCardSection()
    var success = false 

    const sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
    const sorted_data = new Map([...sender_data].sort((a,b) => b[1].count - a[1].count));

    sorted_data.forEach(function(value, key){
      const email = value.email
      if (key.includes(input) || email.includes(input)){
        success = true
        Logger.log(key)

        search_results.addWidget(create_card(key, value))
        search_results.addWidget(create_cardbuttons(value.link, value.email, value.mailto))
      }
    })

    if(success){
      card.addSection(search_results)
      return [card.build()]
    }
  }
}

function send_mailto(address, subject, body, bcc, cc) {
  
  var message = 'MIME-Version: 1.0\r\n' +
    'To: <' + address + '>\r\n' +
    'cc: ' + cc + '\r\n' +
    'bcc: ' + bcc + '\r\n' +
    'Subject: ' + subject + '\r\n' +
    'Content-Type: text/html; charset=UTF-8\r\n\r\n' + body + '\r\n'

  var params = {
    method: "post",
    contentType: 'message/rfc822',
    headers: {
      "Authorization": "Bearer " + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true,
    payload: message
  };

  UrlFetchApp.fetch("https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send", params);
}

function handle_mailto(mailto){
  const subject_regex = /subject=([^&\s]+)/g
  const body_regex = /&body=([^&\s]+)/g
  const bcc_regex = /&bcc=([^&\s]+)/g
  const cc_regex = /&cc=([^&\s]+)/g

  // Logger.log(value.mailto)
  const mailto_split = mailto.split('?')
  const address = mailto_split[0]
  // Logger.log(address)
  var subject = ''
  var body = ''
  var bcc = ''
  var cc = ''

  const email_info = mailto_split[1]
  if (email_info){
    // Logger.log(email_info)
    
    const subject_result = subject_regex.exec(email_info)
    if (subject_result){
      subject = subject_result[1]
    }

    const body_result = body_regex.exec(email_info)
    if (body_result){
      body = body_result[1]
    }
    
    const bcc_result = bcc_regex.exec(email_info)
    if (bcc_result){
      bcc = bcc_result[1]
    }

    const cc_result = cc_regex.exec(email_info)
    if (cc_result){
      cc = cc_result[1]
    }
  }
  // Logger.log(address)
  // Logger.log(subject)
  // Logger.log(body)

  send_mailto(address, subject, body, bcc, cc)

}

function unsubscribe(e){

  if(e.parameters.link != 'not found'){
    return CardService.newActionResponseBuilder()
      .setOpenLink(CardService.newOpenLink()
          .setUrl(e.parameters.link))
      .build();
  }

  else if (e.parameters.mailto != 'not found'){
    handle_mailto(e.parameters.mailto)
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification()
          .setText('Unsubscribed through mailto!'))
      .build();
  }

  else{
    return CardService.newActionResponseBuilder()
      .setOpenLink(CardService.newOpenLink()
          .setUrl(e.parameters.search))
      .build();
  }
} 

function delete_emails(e){
  Logger.log('delete_emails')
  Logger.log(e.parameters)
  Logger.log(e.parameters.email)

  batch_trash(e.parameters.email)

  text = "Deleted all emails from " + e.parameters.email

  return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification()
          .setText(text))
      .build();
}

function batch_trash(address){
  const parameter = 'from:'+ address
  const messageList = Gmail.Users.Messages.list('me', {
    q: parameter,
    pageToken: null,
    maxResults: 500,
  })

  const messages = messageList.messages
  if (messages){
    let message_ids = messages.map(message => message.id);
  Logger.log(message_ids)

  //create list of objects containing the requests 
  var body = messages.map(function(message){
    return {
        method: "POST", 
        endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + message.id + '/trash'
    }
  });
  Logger.log(body)


  // build out the rest of the requests for each request in body 
  var boundary = "xxxxxxxxxx";
  var contentId = 0;
  var data = "--" + boundary + "\r\n";
  for (var i in body) {
    data += "Content-Type: application/http\r\n";
    data += "Content-ID: " + ++contentId + "\r\n\r\n";
    data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
    data += "--" + boundary + "\r\n";
  }
  Logger.log(data)

  const payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

  // boilerplate for request 
  const options = {
    method: "post",
    contentType: "multipart/mixed; boundary=" + boundary,
    payload: payload,
    headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
    muteHttpExceptions: true,
  };

  //submit request 
  const  url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
  
  const res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
  // Logger.log(res)
  }

}

function create_card(key, value){
  const email = value.email
  const search = 'https://mail.google.com/mail/u/0/#search/from%3A+' + email
  const text = '<b>' + '('+ value.count + ') ' + key + '<b>'

  const email_card = CardService.newDecoratedText()
    .setText(text)
    .setBottomLabel(email)
    .setWrapText(true)
    .setOpenLink(CardService.newOpenLink().setUrl(search))
  return email_card
}

function create_searchbar(input){
  const searchbar = CardService.newCardSection()
    .addWidget(CardService.newTextInput()
      .setFieldName("search")
      .setTitle("Search")
      .setValue(input)
      .setOnChangeAction(CardService.newAction().setFunctionName('search')))

  return searchbar
}

function create_cardbuttons(link, email, mailto){

  const search = 'https://mail.google.com/mail/u/0/#search/from%3A+' + email


  var unsub_text = 'Unsubscribe'
    if (link == 'not found' && mailto == 'not found'){
      unsub_text = 'Unsub Manually'
    }
    else if (link == 'not found' && mailto != 'not found'){
      unsub_text = 'Unsubscribe (Mailto)'
    }

  const cardbuttons = CardService.newButtonSet()
    .addButton(CardService.newTextButton()
      .setText('Delete Emails')
      .setOnClickAction(CardService.newAction().setFunctionName('delete_emails')
      .setParameters({"email": email})))
    .addButton(CardService.newTextButton()
      .setText(unsub_text)
      .setOnClickAction(CardService.newAction().setFunctionName('unsubscribe')
      .setParameters({"link": link, 'mailto': mailto, 'search': search})))

  return cardbuttons
  
}

function batchMessages(messageList, sender_data) {
  // 1. requests content inside each message of messageList 
  //create list of objects containing the requests 
  var body = messageList.map(function(e){
    return {
        method: "GET",
        endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + e.id
    }
  });
  // Logger.log(body)

  // build out the rest of the requests for each request in body 
  var boundary = "xxxxxxxxxx";
  var contentId = 0;
  var data = "--" + boundary + "\r\n";
  for (var i in body) {
    data += "Content-Type: application/http\r\n";
    data += "Content-ID: " + ++contentId + "\r\n\r\n";
    data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
    data += "--" + boundary + "\r\n";
  }
  // Logger.log(data)

  var payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

  // boilerplate for request 
  var options = {
    method: "post",
    contentType: "multipart/mixed; boundary=" + boundary,
    payload: payload,
    headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
    muteHttpExceptions: true,
  };

  //submit request 
  var url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
  
  var res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
  // Logger.log(res)

  //split into individual outputs 
  var dat = res.split("--batch");
  // Logger.log(dat)

  // dat.ForEach(function(d){
  //   Logger.log(d)
  // })

  // grab only the output, filtering out the headers 
  var message_headers = dat.slice(1, dat.length - 1).map(function(e){return e.match(/{[\S\s]+}/g)[0]});

  return message_headers
}

function update_sender_data(headers, sender_data){
  // isolates List-Unsubscribe header data from each message 
  headers.map(function(e){

    var unsub_link = 'not found'
    var mailto = 'not found'

    const sender_full = JSON.parse(e).payload.headers.find(item => item.name === 'From').value
    const name = sender_full.replace(/<[^>]*>/g, "").replaceAll('"', '')

    var unsub_array = JSON.parse(e).payload.headers.find(item => item.name === 'List-Unsubscribe')
    if (unsub_array){

      const unsub_match = unsub_array.value.match(/https?:\/\/(.+?)(\s|,)/);
      if (unsub_match) {
        unsub_link = unsub_match[0];
      }
      const mailto_match = unsub_array.value.match(/mailto:(.+?)(\s|,|>)/);
      if (mailto_match) {
        mailto = mailto_match[1];
      }
    }

    if (sender_data.has(name)){
      sender_values = sender_data.get(name)
      sender_data.set(name, {'email': sender_values.email, 'count': sender_values.count+1, 'delete': false, 
      'link': unsub_link, 'mailto': mailto})
    }
    else{
      const email = sender_full.match(/<([^<]*)>/, "");
      if (email){
        // Logger.log(typeof email[0])
        sender_data.set(name, {'email': email[1], 'count':1, 'delete':false, 'link': unsub_link, 'mailto': mailto})
      }
      else{
        // Logger.log(typeof name)
        sender_data.set(name, {'email': name, 'count':1, 'delete':false, 'link': unsub_link, 'mailto': mailto})
      }
    }
  })

  return sender_data

}

function email_counts(sender_data, pageToken){

  // scan 500 emails in 1 run, 500 at a time 
  for (let i=0; i<1; i++){
    // pull message id's 500 at a time 
    var messageList = Gmail.Users.Messages.list('me', {
        q: '+unsubscribe',
        pageToken: pageToken,
        maxResults: 500,
        })
    var messages = messageList.messages
    // Logger.log(messages)

    var messages_50 = [] // batch request messages 50 at a time 
    while (messages.length){
      messages_50.push(messages.splice(0, 50));
    }
    // Logger.log(messages_100.length)
    
    // send requests for message headers in batches of 50 
    messages_50.forEach(function(message_block){
      // Logger.log('messages_50')
      const message_headers = batchMessages(message_block, sender_data)
      sender_data = update_sender_data(message_headers, sender_data)
    })
    pageToken = messageList.nextPageToken //reassign page token 
  }

  return [sender_data, pageToken]
}

function run_zero(){
  // create new card
  var card = CardService.newCardBuilder()
  card.addSection(create_searchbar('')) // add search bar to card 

  var sender_data;
  var pageToken;

  //get property if hasn't run already
  const userProperties = PropertiesService.getUserProperties();

  if (userProperties.getKeys().length ==2){
    Logger.log('2 objects in userProperties')
    sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
    pageToken = userProperties.getProperty('pageToken')
  }
  else if (userProperties.getKeys().length ==1){
    Logger.log('rerunning!')
    userProperties.setProperty('pageToken', '')
    sender_data = new Map()
    userProperties.setProperty('sender_data', '')

  }
  else{
    sender_data = new Map()
    pageToken = null
  }

  sender_data = email_counts(sender_data, pageToken)

  const data = sender_data[0]
  const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count));

  sorted_data.forEach(function(value, key){
      const home = CardService.newCardSection()
        .addWidget(create_card(key, value))
        .addWidget(create_cardbuttons(value.link, value.email, value.mailto))
      card.addSection(home)
  })

  const property_data = JSON.stringify(Array.from(sender_data[0].entries()));
  let button_text = ''
  if (sender_data[1]){
    Logger.log('scan next 5')
    button_text = 'Scan Next 500'
    userProperties.setProperty('pageToken', sender_data[1])
    // Logger.log(sender_data[1])
    userProperties.setProperty('sender_data', property_data);
  }
  else{
    button_text = 'Scan Complete! Run Again?'
    userProperties.deleteProperty('pageToken')
    userProperties.setProperty('sender_data', property_data);
  }

  // create footer 
  var fixedFooter = CardService.newFixedFooter()
    .setPrimaryButton(CardService.newTextButton().setText(button_text)
      .setOnClickAction(CardService.newAction()
        .setFunctionName("run_zero")))
  card.setFixedFooter(fixedFooter)

  // set nav
  var nav = CardService.newNavigation().updateCard(card.build());

  return CardService.newActionResponseBuilder()
      .setNavigation(nav)
      .build();
}

function project_zero(){

  // create a new card, create a card section with a search bar, and add it to the new card
  var card = CardService.newCardBuilder()

  // pull current properties, and if any exist, create widgets displaying info and buttons for each cards 
  const userProperties = PropertiesService.getUserProperties();
  // Logger.log(Object.values(userProperties.getProperties()))  

  // render cards if previous data exists
  if (userProperties.getKeys().length !=0){
    card.addSection(create_searchbar(''))


    const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
    const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count));

    sorted_data.forEach(function(value, key){
      home = CardService.newCardSection()
        .addWidget(create_card(key, value))
        .addWidget(create_cardbuttons(value.link, value.email, value.mailto))
      card.addSection(home)
    })
  }

  // create footer 
  var fixedFooter = CardService.newFixedFooter()
    .setPrimaryButton(CardService.newTextButton().setText("Run Project Zero")
      .setOnClickAction(CardService.newAction()
        .setFunctionName("run_zero")))
  card.setFixedFooter(fixedFooter).build()

  return [card.build()]
}

function deleteProperties(){
  const userProperties = PropertiesService.getUserProperties();
  userProperties.deleteAllProperties()
}

function logProperties(){
  const userProperties = PropertiesService.getUserProperties();

  const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
  data.forEach(function(value, key){
    Logger.log(value)
    Logger.log(key)
  })
}

function countProperties(){
  const userProperties = PropertiesService.getUserProperties();
  counts = {'mailto': 0, 'unsub_link': 0}
  const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
  data.forEach(function(value, key){
    if (value.mailto != 'not found'){
      counts.mailto = counts.mailto += 1 
    } 

    if (value.unsub_link != 'not found'){
      counts.unsub_link = counts.unsub_link += 1 
    } 
  })
  Logger.log(counts)
}

function logMailtos(){
  const userProperties = PropertiesService.getUserProperties();

  const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
  data.forEach(function(value, key){
    if (value.mailto != 'not found'){
      Logger.log(value.mailto)
    }
  })
}
}


/***
 * v16: 
 * Code Refactoring: Batch Messages (done)
 */
// function update_properties(){
//   // grab current properties
//   const userProperties = PropertiesService.getUserProperties();
  
//   // grab all new (1 day old) messages with unsubscribe 
//   const parameter = '+unsubscribe'+ '  newer_than:1d'
//   const newmessage_list = Gmail.Users.Messages.list('me', {
//     q: parameter,
//     pageToken: null,
//     maxResults: 500,
//   })
//   // Logger.log(newmessage_list)

//   // update userProperties if any new
//   const new_messages = newmessage_list.messages
//   if (new_messages){
//     const sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))

//     const updated_data = batchMessages(new_messages, sender_data)
//     // Logger.log(updated_data.entries())
//     const property_data = JSON.stringify(Array.from(updated_data.entries()));

//     userProperties.setProperty('sender_data', property_data);
//   }
// }

// function search(e){
//   var input = e.formInput.search
//   // Logger.log(input)

//   if (input!=null){
//     const userProperties = PropertiesService.getUserProperties();
//     // Logger.log(userProperties.getProperties())

//     // create a card 
//     var card = CardService.newCardBuilder()

//     // create search bar 
//     card.addSection(create_searchbar(input))

//     var search_results = CardService.newCardSection()
//     var success = false 

//     const sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//     const sorted_data = new Map([...sender_data].sort((a,b) => b[1].count - a[1].count));

//     sorted_data.forEach(function(value, key){
//       const email = value.email
//       if (key.includes(input) || email.includes(input)){
//         success = true
//         Logger.log(key)

//         search_results.addWidget(create_card(key, value))
//         search_results.addWidget(create_cardbuttons(value.link, value.email, value.mailto))
//       }
//     })

//     if(success){
//       card.addSection(search_results)
//       return [card.build()]
//     }
//   }
// }

// function send_mailto(address, subject, body, bcc, cc) {
  
//   var message = 'MIME-Version: 1.0\r\n' +
//     'To: <' + address + '>\r\n' +
//     'cc: ' + cc + '\r\n' +
//     'bcc: ' + bcc + '\r\n' +
//     'Subject: ' + subject + '\r\n' +
//     'Content-Type: text/html; charset=UTF-8\r\n\r\n' + body + '\r\n'

//   var params = {
//     method: "post",
//     contentType: 'message/rfc822',
//     headers: {
//       "Authorization": "Bearer " + ScriptApp.getOAuthToken()
//     },
//     muteHttpExceptions: true,
//     payload: message
//   };

//   UrlFetchApp.fetch("https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send", params);
// }

// function handle_mailto(mailto){
//   const subject_regex = /subject=([^&\s]+)/g
//   const body_regex = /&body=([^&\s]+)/g
//   const bcc_regex = /&bcc=([^&\s]+)/g
//   const cc_regex = /&cc=([^&\s]+)/g

//   // Logger.log(value.mailto)
//   const mailto_split = mailto.split('?')
//   const address = mailto_split[0]
//   // Logger.log(address)
//   var subject = ''
//   var body = ''
//   var bcc = ''
//   var cc = ''

//   const email_info = mailto_split[1]
//   if (email_info){
//     // Logger.log(email_info)
    
//     const subject_result = subject_regex.exec(email_info)
//     if (subject_result){
//       subject = subject_result[1]
//     }

//     const body_result = body_regex.exec(email_info)
//     if (body_result){
//       body = body_result[1]
//     }
    
//     const bcc_result = bcc_regex.exec(email_info)
//     if (bcc_result){
//       bcc = bcc_result[1]
//     }

//     const cc_result = cc_regex.exec(email_info)
//     if (cc_result){
//       cc = cc_result[1]
//     }
//   }
//   // Logger.log(address)
//   // Logger.log(subject)
//   // Logger.log(body)

//   send_mailto(address, subject, body, bcc, cc)

// }

// function unsubscribe(e){

//   if(e.parameters.link != 'not found'){
//     return CardService.newActionResponseBuilder()
//       .setOpenLink(CardService.newOpenLink()
//           .setUrl(e.parameters.link))
//       .build();
//   }

//   else if (e.parameters.mailto != 'not found'){
//     handle_mailto(e.parameters.mailto)
//     return CardService.newActionResponseBuilder()
//       .setNotification(CardService.newNotification()
//           .setText('Unsubscribed through mailto!'))
//       .build();
//   }

//   else{
//     return CardService.newActionResponseBuilder()
//       .setOpenLink(CardService.newOpenLink()
//           .setUrl(e.parameters.search))
//       .build();
//   }
// } 

// function delete_emails(e){
//   Logger.log('delete_emails')
//   Logger.log(e.parameters)
//   Logger.log(e.parameters.email)

//   batch_trash(e.parameters.email)

//   text = "Deleted all emails from " + e.parameters.email

//   return CardService.newActionResponseBuilder()
//       .setNotification(CardService.newNotification()
//           .setText(text))
//       .build();
// }

// function batch_trash(address){
//   const parameter = 'from:'+ address
//   const messageList = Gmail.Users.Messages.list('me', {
//     q: parameter,
//     pageToken: null,
//     maxResults: 500,
//   })

//   const messages = messageList.messages
//   if (messages){
//     let message_ids = messages.map(message => message.id);
//   Logger.log(message_ids)

//   //create list of objects containing the requests 
//   var body = messages.map(function(message){
//     return {
//         method: "POST", 
//         endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + message.id + '/trash'
//     }
//   });
//   Logger.log(body)


//   // build out the rest of the requests for each request in body 
//   var boundary = "xxxxxxxxxx";
//   var contentId = 0;
//   var data = "--" + boundary + "\r\n";
//   for (var i in body) {
//     data += "Content-Type: application/http\r\n";
//     data += "Content-ID: " + ++contentId + "\r\n\r\n";
//     data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
//     data += "--" + boundary + "\r\n";
//   }
//   Logger.log(data)

//   const payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

//   // boilerplate for request 
//   const options = {
//     method: "post",
//     contentType: "multipart/mixed; boundary=" + boundary,
//     payload: payload,
//     headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
//     muteHttpExceptions: true,
//   };

//   //submit request 
//   const  url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
  
//   const res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
//   // Logger.log(res)
//   }

// }

// function create_card(key, value){
//   const email = value.email
//   const search = 'https://mail.google.com/mail/u/0/#search/from%3A+' + email
//   const text = '<b>' + '('+ value.count + ') ' + key + '<b>'

//   const email_card = CardService.newDecoratedText()
//     .setText(text)
//     .setBottomLabel(email)
//     .setWrapText(true)
//     .setOpenLink(CardService.newOpenLink().setUrl(search))
//   return email_card
// }

// function create_searchbar(input){
//   const searchbar = CardService.newCardSection()
//     .addWidget(CardService.newTextInput()
//       .setFieldName("search")
//       .setTitle("Search")
//       .setValue(input)
//       .setOnChangeAction(CardService.newAction().setFunctionName('search')))

//   return searchbar
// }

// function create_cardbuttons(link, email, mailto){

//   const search = 'https://mail.google.com/mail/u/0/#search/from%3A+' + email


//   var unsub_text = 'Unsubscribe'
//     if (link == 'not found' && mailto == 'not found'){
//       unsub_text = 'Unsub Manually'
//     }
//     else if (link == 'not found' && mailto != 'not found'){
//       unsub_text = 'Unsubscribe (Mailto)'
//     }

//   const cardbuttons = CardService.newButtonSet()
//     .addButton(CardService.newTextButton()
//       .setText('Delete Emails')
//       .setOnClickAction(CardService.newAction().setFunctionName('delete_emails')
//       .setParameters({"email": email})))
//     .addButton(CardService.newTextButton()
//       .setText(unsub_text)
//       .setOnClickAction(CardService.newAction().setFunctionName('unsubscribe')
//       .setParameters({"link": link, 'mailto': mailto, 'search': search})))

//   return cardbuttons
  
// }

// function batchMessages(messageList, sender_data) {
//   // 1. requests content inside each message of messageList 
//   //create list of objects containing the requests 
//   var body = messageList.map(function(e){
//     return {
//         method: "GET",
//         endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + e.id
//     }
//   });
//   // Logger.log(body)

//   // build out the rest of the requests for each request in body 
//   var boundary = "xxxxxxxxxx";
//   var contentId = 0;
//   var data = "--" + boundary + "\r\n";
//   for (var i in body) {
//     data += "Content-Type: application/http\r\n";
//     data += "Content-ID: " + ++contentId + "\r\n\r\n";
//     data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
//     data += "--" + boundary + "\r\n";
//   }
//   // Logger.log(data)

//   var payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

//   // boilerplate for request 
//   var options = {
//     method: "post",
//     contentType: "multipart/mixed; boundary=" + boundary,
//     payload: payload,
//     headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
//     muteHttpExceptions: true,
//   };

//   //submit request 
//   var url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
  
//   var res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
//   // Logger.log(res)

//   //split into individual outputs 
//   var dat = res.split("--batch");
//   // Logger.log(dat)

//   // dat.ForEach(function(d){
//   //   Logger.log(d)
//   // })

//   // grab only the output, filtering out the headers 
//   var message_headers = dat.slice(1, dat.length - 1).map(function(e){return e.match(/{[\S\s]+}/g)[0]});

//   return message_headers
// }

// function update_sender_data(headers, sender_data){
//   // isolates List-Unsubscribe header data from each message 
//   headers.map(function(e){

//     var unsub_link = 'not found'
//     var mailto = 'not found'

//     const sender_full = JSON.parse(e).payload.headers.find(item => item.name === 'From').value
//     const name = sender_full.replace(/<[^>]*>/g, "").replaceAll('"', '')

//     var unsub_array = JSON.parse(e).payload.headers.find(item => item.name === 'List-Unsubscribe')
//     if (unsub_array){

//       const unsub_match = unsub_array.value.match(/https?:\/\/(.+?)(\s|,)/);
//       if (unsub_match) {
//         unsub_link = unsub_match[0];
//       }
//       const mailto_match = unsub_array.value.match(/mailto:(.+?)(\s|,|>)/);
//       if (mailto_match) {
//         mailto = mailto_match[1];
//       }
//     }

//     if (sender_data.has(name)){
//       sender_values = sender_data.get(name)
//       sender_data.set(name, {'email': sender_values.email, 'count': sender_values.count+1, 'delete': false, 
//       'link': unsub_link, 'mailto': mailto})
//     }
//     else{
//       const email = sender_full.match(/<([^<]*)>/, "");
//       if (email){
//         // Logger.log(typeof email[0])
//         sender_data.set(name, {'email': email[1], 'count':1, 'delete':false, 'link': unsub_link, 'mailto': mailto})
//       }
//       else{
//         // Logger.log(typeof name)
//         sender_data.set(name, {'email': name, 'count':1, 'delete':false, 'link': unsub_link, 'mailto': mailto})
//       }
//     }
//   })

//   return sender_data

// }

// function email_counts(sender_data, pageToken){

//   // scan 500 emails in 1 run, 500 at a time 
//   for (let i=0; i<1; i++){
//     // pull message id's 500 at a time 
//     var messageList = Gmail.Users.Messages.list('me', {
//         q: '+unsubscribe',
//         pageToken: pageToken,
//         maxResults: 500,
//         })
//     var messages = messageList.messages
//     // Logger.log(messages)

//     var messages_50 = [] // batch request messages 50 at a time 
//     while (messages.length){
//       messages_50.push(messages.splice(0, 50));
//     }
//     // Logger.log(messages_100.length)
    
//     // send requests for message headers in batches of 50 
//     messages_50.forEach(function(message_block){
//       // Logger.log('messages_50')
//       const message_headers = batchMessages(message_block, sender_data)
//       sender_data = update_sender_data(message_headers, sender_data)
//     })
//     pageToken = messageList.nextPageToken //reassign page token 
//   }

//   return [sender_data, pageToken]
// }

// function run_zero(){
//   // create new card
//   var card = CardService.newCardBuilder()
//   card.addSection(create_searchbar('')) // add search bar to card 

//   var sender_data;
//   var pageToken;

//   //get property if hasn't run already
//   const userProperties = PropertiesService.getUserProperties();

//   if (userProperties.getKeys().length ==2){
//     Logger.log('2 objects in userProperties')
//     sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//     pageToken = userProperties.getProperty('pageToken')
//   }
//   else if (userProperties.getKeys().length ==1){
//     Logger.log('rerunning!')
//     userProperties.setProperty('pageToken', '')
//     sender_data = new Map()
//     userProperties.setProperty('sender_data', '')

//   }
//   else{
//     sender_data = new Map()
//     pageToken = null
//   }

//   sender_data = email_counts(sender_data, pageToken)

//   const data = sender_data[0]
//   const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count));

//   sorted_data.forEach(function(value, key){
//       const home = CardService.newCardSection()
//         .addWidget(create_card(key, value))
//         .addWidget(create_cardbuttons(value.link, value.email, value.mailto))
//       card.addSection(home)
//   })

//   const property_data = JSON.stringify(Array.from(sender_data[0].entries()));
//   let button_text = ''
//   if (sender_data[1]){
//     Logger.log('scan next 5')
//     button_text = 'Scan Next 500'
//     userProperties.setProperty('pageToken', sender_data[1])
//     // Logger.log(sender_data[1])
//     userProperties.setProperty('sender_data', property_data);
//   }
//   else{
//     button_text = 'Scan Complete! Run Again?'
//     userProperties.deleteProperty('pageToken')
//     userProperties.setProperty('sender_data', property_data);
//   }

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText(button_text)
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero")))
//   card.setFixedFooter(fixedFooter)

//   // set nav
//   var nav = CardService.newNavigation().updateCard(card.build());

//   return CardService.newActionResponseBuilder()
//       .setNavigation(nav)
//       .build();
// }

// function project_zero(){

//   // create a new card, create a card section with a search bar, and add it to the new card
//   var card = CardService.newCardBuilder()

//   // pull current properties, and if any exist, create widgets displaying info and buttons for each cards 
//   const userProperties = PropertiesService.getUserProperties();
//   // Logger.log(Object.values(userProperties.getProperties()))  

//   // render cards if previous data exists
//   if (userProperties.getKeys().length !=0){
//     card.addSection(create_searchbar(''))


//     const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//     const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count));

//     sorted_data.forEach(function(value, key){
//       home = CardService.newCardSection()
//         .addWidget(create_card(key, value))
//         .addWidget(create_cardbuttons(value.link, value.email, value.mailto))
//       card.addSection(home)
//     })
//   }

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText("Run Project Zero")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero")))
//   card.setFixedFooter(fixedFooter).build()

//   return [card.build()]
// }

// function deleteProperties(){
//   const userProperties = PropertiesService.getUserProperties();
//   userProperties.deleteAllProperties()
// }

// function logProperties(){
//   const userProperties = PropertiesService.getUserProperties();

//   const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//   data.forEach(function(value, key){
//     Logger.log(value)
//     Logger.log(key)
//   })
// }

// function countProperties(){
//   const userProperties = PropertiesService.getUserProperties();
//   counts = {'mailto': 0, 'unsub_link': 0}
//   const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//   data.forEach(function(value, key){
//     if (value.mailto != 'not found'){
//       counts.mailto = counts.mailto += 1 
//     } 

//     if (value.unsub_link != 'not found'){
//       counts.unsub_link = counts.unsub_link += 1 
//     } 
//   })
//   Logger.log(counts)
// }

// function logMailtos(){
//   const userProperties = PropertiesService.getUserProperties();

//   const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//   data.forEach(function(value, key){
//     if (value.mailto != 'not found'){
//       Logger.log(value.mailto)
//     }
//   })
// }


/***
 * v15: 
  * Code Refactoring (done, except for batch messages )
 */

// function update_properties(){
//   // grab current properties
//   const userProperties = PropertiesService.getUserProperties();
  
//   // grab all new (1 day old) messages with unsubscribe 
//   const parameter = '+unsubscribe'+ '  newer_than:1d'
//   const newmessage_list = Gmail.Users.Messages.list('me', {
//     q: parameter,
//     pageToken: null,
//     maxResults: 500,
//   })
//   // Logger.log(newmessage_list)

//   // update userProperties if any new
//   const new_messages = newmessage_list.messages
//   if (new_messages){
//     const sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))

//     const updated_data = batchMessages(new_messages, sender_data)
//     // Logger.log(updated_data.entries())
//     const property_data = JSON.stringify(Array.from(updated_data.entries()));

//     userProperties.setProperty('sender_data', property_data);
//   }
// }

// function search(e){
//   var input = e.formInput.search
//   // Logger.log(input)

//   if (input!=null){
//     const userProperties = PropertiesService.getUserProperties();
//     // Logger.log(userProperties.getProperties())

//     // create a card 
//     var card = CardService.newCardBuilder()

//     // create search bar 
//     card.addSection(create_searchbar(input))

//     var search_results = CardService.newCardSection()
//     var success = false 

//     const sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//     const sorted_data = new Map([...sender_data].sort((a,b) => b[1].count - a[1].count));

//     sorted_data.forEach(function(value, key){
//       const email = value.email
//       if (key.includes(input) || email.includes(input)){
//         success = true
//         Logger.log(key)

//         search_results.addWidget(create_card(key, value))
//         search_results.addWidget(create_cardbuttons(value.link, value.email, value.mailto))
//       }
//     })

//     if(success){
//       card.addSection(search_results)
//       return [card.build()]
//     }
//   }
// }

// function send_mailto(address, subject, body, bcc, cc) {
  
//   var message = 'MIME-Version: 1.0\r\n' +
//     'To: <' + address + '>\r\n' +
//     'cc: ' + cc + '\r\n' +
//     'bcc: ' + bcc + '\r\n' +
//     'Subject: ' + subject + '\r\n' +
//     'Content-Type: text/html; charset=UTF-8\r\n\r\n' + body + '\r\n'

//   var params = {
//     method: "post",
//     contentType: 'message/rfc822',
//     headers: {
//       "Authorization": "Bearer " + ScriptApp.getOAuthToken()
//     },
//     muteHttpExceptions: true,
//     payload: message
//   };

//   UrlFetchApp.fetch("https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send", params);
// }

// function handle_mailto(mailto){
//   const subject_regex = /subject=([^&\s]+)/g
//   const body_regex = /&body=([^&\s]+)/g
//   const bcc_regex = /&bcc=([^&\s]+)/g
//   const cc_regex = /&cc=([^&\s]+)/g

//   // Logger.log(value.mailto)
//   const mailto_split = mailto.split('?')
//   const address = mailto_split[0]
//   // Logger.log(address)
//   var subject = ''
//   var body = ''
//   var bcc = ''
//   var cc = ''

//   const email_info = mailto_split[1]
//   if (email_info){
//     // Logger.log(email_info)
    
//     const subject_result = subject_regex.exec(email_info)
//     if (subject_result){
//       subject = subject_result[1]
//     }

//     const body_result = body_regex.exec(email_info)
//     if (body_result){
//       body = body_result[1]
//     }
    
//     const bcc_result = bcc_regex.exec(email_info)
//     if (bcc_result){
//       bcc = bcc_result[1]
//     }

//     const cc_result = cc_regex.exec(email_info)
//     if (cc_result){
//       cc = cc_result[1]
//     }
//   }
//   // Logger.log(address)
//   // Logger.log(subject)
//   // Logger.log(body)

//   send_mailto(address, subject, body, bcc, cc)

// }

// function unsubscribe(e){

//   if(e.parameters.link != 'not found'){
//     return CardService.newActionResponseBuilder()
//       .setOpenLink(CardService.newOpenLink()
//           .setUrl(e.parameters.link))
//       .build();
//   }

//   else if (e.parameters.mailto != 'not found'){
//     handle_mailto(e.parameters.mailto)
//     return CardService.newActionResponseBuilder()
//       .setNotification(CardService.newNotification()
//           .setText('Unsubscribed through mailto!'))
//       .build();
//   }

//   else{
//     return CardService.newActionResponseBuilder()
//       .setOpenLink(CardService.newOpenLink()
//           .setUrl(e.parameters.search))
//       .build();
//   }
// } 

// function delete_emails(e){
//   Logger.log('delete_emails')
//   Logger.log(e.parameters)
//   Logger.log(e.parameters.email)

//   batch_trash(e.parameters.email)

//   text = "Deleted all emails from " + e.parameters.email

//   return CardService.newActionResponseBuilder()
//       .setNotification(CardService.newNotification()
//           .setText(text))
//       .build();
// }

// function batch_trash(address){
//   const parameter = 'from:'+ address
//   const messageList = Gmail.Users.Messages.list('me', {
//     q: parameter,
//     pageToken: null,
//     maxResults: 500,
//   })

//   const messages = messageList.messages
//   if (messages){
//     let message_ids = messages.map(message => message.id);
//   Logger.log(message_ids)

//   //create list of objects containing the requests 
//   var body = messages.map(function(message){
//     return {
//         method: "POST", 
//         endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + message.id + '/trash'
//     }
//   });
//   Logger.log(body)


//   // build out the rest of the requests for each request in body 
//   var boundary = "xxxxxxxxxx";
//   var contentId = 0;
//   var data = "--" + boundary + "\r\n";
//   for (var i in body) {
//     data += "Content-Type: application/http\r\n";
//     data += "Content-ID: " + ++contentId + "\r\n\r\n";
//     data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
//     data += "--" + boundary + "\r\n";
//   }
//   Logger.log(data)

//   const payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

//   // boilerplate for request 
//   const options = {
//     method: "post",
//     contentType: "multipart/mixed; boundary=" + boundary,
//     payload: payload,
//     headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
//     muteHttpExceptions: true,
//   };

//   //submit request 
//   const  url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
  
//   const res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
//   // Logger.log(res)
//   }

// }

// function create_card(key, value){
//   const email = value.email
//   const search = 'https://mail.google.com/mail/u/0/#search/from%3A+' + email
//   const text = '<b>' + '('+ value.count + ') ' + key + '<b>'

//   const email_card = CardService.newDecoratedText()
//     .setText(text)
//     .setBottomLabel(email)
//     .setWrapText(true)
//     .setOpenLink(CardService.newOpenLink().setUrl(search))
//   return email_card
// }

// function create_searchbar(input){
//   const searchbar = CardService.newCardSection()
//     .addWidget(CardService.newTextInput()
//       .setFieldName("search")
//       .setTitle("Search")
//       .setValue(input)
//       .setOnChangeAction(CardService.newAction().setFunctionName('search')))

//   return searchbar
// }

// function create_cardbuttons(link, email, mailto){

//   const search = 'https://mail.google.com/mail/u/0/#search/from%3A+' + email


//   var unsub_text = 'Unsubscribe'
//     if (link == 'not found' && mailto == 'not found'){
//       unsub_text = 'Unsub Manually'
//     }
//     else if (link == 'not found' && mailto != 'not found'){
//       unsub_text = 'Unsubscribe (Mailto)'
//     }

//   const cardbuttons = CardService.newButtonSet()
//     .addButton(CardService.newTextButton()
//       .setText('Delete Emails')
//       .setOnClickAction(CardService.newAction().setFunctionName('delete_emails')
//       .setParameters({"email": email})))
//     .addButton(CardService.newTextButton()
//       .setText(unsub_text)
//       .setOnClickAction(CardService.newAction().setFunctionName('unsubscribe')
//       .setParameters({"link": link, 'mailto': mailto, 'search': search})))

//   return cardbuttons
  
// }

// function batchMessages(messageList, sender_data) {
//   // 1. requests content inside each message of messageList 
//   //create list of objects containing the requests 
//   var body = messageList.map(function(e){
//     return {
//         method: "GET",
//         endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + e.id
//     }
//   });
//   // Logger.log(body)

//   // build out the rest of the requests for each request in body 
//   var boundary = "xxxxxxxxxx";
//   var contentId = 0;
//   var data = "--" + boundary + "\r\n";
//   for (var i in body) {
//     data += "Content-Type: application/http\r\n";
//     data += "Content-ID: " + ++contentId + "\r\n\r\n";
//     data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
//     data += "--" + boundary + "\r\n";
//   }
//   // Logger.log(data)

//   var payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

//   // boilerplate for request 
//   var options = {
//     method: "post",
//     contentType: "multipart/mixed; boundary=" + boundary,
//     payload: payload,
//     headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
//     muteHttpExceptions: true,
//   };

//   //submit request 
//   var url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
  
//   var res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
//   // Logger.log(res)

//   //split into individual outputs 
//   var dat = res.split("--batch");
//   // Logger.log(dat)

//   // dat.ForEach(function(d){
//   //   Logger.log(d)
//   // })

//   // grab only the output, filtering out the headers 
//   var result = dat.slice(1, dat.length - 1).map(function(e){return e.match(/{[\S\s]+}/g)[0]});
  
//   // isolates List-Unsubscribe header data from each message 
//   result.map(function(e){
//     const sender_full = JSON.parse(e).payload.headers.find(item => item.name === 'From').value
//     const name = sender_full.replace(/<[^>]*>/g, "").replaceAll('"', '')

//     var unsub_array = JSON.parse(e).payload.headers.find(item => item.name === 'List-Unsubscribe')

//     var unsub_link = 'not found'
//     var mailto = 'not found'

//     if (unsub_array){
//       // Logger.log(unsub_array.value)f
//       const unsub_match = unsub_array.value.match(/https?:\/\/(.+?)(\s|,)/);
//       if (unsub_match) {
//         unsub_link = unsub_match[0];
//       }

//       const mailto_match = unsub_array.value.match(/mailto:(.+?)(\s|,|>)/);
//       // Logger.log(mailto_match)
//       if (mailto_match) {
//         // Logger.log(mailto_match[0])
//         mailto = mailto_match[1];
//         Logger.log(mailto)

//         // Logger.log(mailto)
//       }
//     }

//     if (sender_data.has(name)){
//       sender_values = sender_data.get(name)
//       sender_data.set(name, {'email': sender_values.email, 'count': sender_values.count+1, 'delete': false, 
//       'link': unsub_link, 'mailto': mailto})
//     }
//     else{
//       const email = sender_full.match(/<([^<]*)>/, "");
//       if (email){
//         // Logger.log(typeof email[0])
//         sender_data.set(name, {'email': email[1], 'count':1, 'delete':false, 'link': unsub_link, 'mailto': mailto})
//       }
//       else{
//         // Logger.log(typeof name)
//         sender_data.set(name, {'email': name, 'count':1, 'delete':false, 'link': unsub_link, 'mailto': mailto})
//       }
//     }
//   })

//   return sender_data
// }

// function email_counts(sender_data, pageToken){

//   // scan 500 emails in 1 run, 500 at a time 
//   for (let i=0; i<1; i++){
//     // pull message id's 500 at a time 
//     var messageList = Gmail.Users.Messages.list('me', {
//         q: '+unsubscribe',
//         pageToken: pageToken,
//         maxResults: 500,
//         })
//     var messages = messageList.messages
//     // Logger.log(messages)

//     var messages_50 = [] // batch request messages 50 at a time 
//     while (messages.length){
//       messages_50.push(messages.splice(0, 50));
//     }
//     // Logger.log(messages_100.length)
    
//     // send requests for message headers in batches of 50 
//     messages_50.forEach(function(message_block){
//       // Logger.log('messages_50')
//       sender_data = batchMessages(message_block, sender_data)
//     })
//     Logger.log(pageToken)
//     pageToken = messageList.nextPageToken //reassign page token 
//     Logger.log(pageToken)
//   }

//   return [sender_data, pageToken]
// }

// function run_zero(){
//   // create new card
//   var card = CardService.newCardBuilder()
//   card.addSection(create_searchbar('')) // add search bar to card 

//   var sender_data;
//   var pageToken;

//   //get property if hasn't run already
//   const userProperties = PropertiesService.getUserProperties();

//   if (userProperties.getKeys().length ==2){
//     sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//     pageToken = userProperties.getProperty('pageToken')
//   }
//   else if (userProperties.getKeys().length ==1){
//     userProperties.setProperty('pageToken', '')
//     sender_data = new Map()
//   }
//   else{
//     sender_data = new Map()
//     pageToken = null
//   }

//   sender_data = email_counts(sender_data, pageToken)

//   const data = sender_data[0]
//   const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count));

//   sorted_data.forEach(function(value, key){
//       const home = CardService.newCardSection()
//         .addWidget(create_card(key, value))
//         .addWidget(create_cardbuttons(value.link, value.email, value.mailto))
//       card.addSection(home)
//   })

//   const property_data = JSON.stringify(Array.from(sender_data[0].entries()));
//   let button_text = ''
//   if (sender_data[1]){
//     Logger.log('scan next 5')
//     button_text = 'Scan Next 500'
//     userProperties.setProperty('pageToken', sender_data[1])
//     // Logger.log(sender_data[1])
//     userProperties.setProperty('sender_data', property_data);
//   }
//   else{
//     button_text = 'Scan Complete! Run Again?'
//     userProperties.deleteProperty('pageToken')
//     userProperties.setProperty('sender_data', property_data);
//   }

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText(button_text)
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero")))
//   card.setFixedFooter(fixedFooter)

//   // set nav
//   var nav = CardService.newNavigation().updateCard(card.build());

//   return CardService.newActionResponseBuilder()
//       .setNavigation(nav)
//       .build();
// }

// function project_zero(){

//   // create a new card, create a card section with a search bar, and add it to the new card
//   var card = CardService.newCardBuilder()

//   // pull current properties, and if any exist, create widgets displaying info and buttons for each cards 
//   const userProperties = PropertiesService.getUserProperties();
//   // Logger.log(Object.values(userProperties.getProperties()))  

//   // render cards if previous data exists
//   if (userProperties.getKeys().length !=0){
//     card.addSection(create_searchbar(''))


//     const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//     const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count));

//     sorted_data.forEach(function(value, key){
//       home = CardService.newCardSection()
//         .addWidget(create_card(key, value))
//         .addWidget(create_cardbuttons(value.link, value.email, value.mailto))
//       card.addSection(home)
//     })
//   }

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText("Run Project Zero")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero")))
//   card.setFixedFooter(fixedFooter).build()

//   return [card.build()]
// }

// function deleteProperties(){
//   const userProperties = PropertiesService.getUserProperties();
//   userProperties.deleteAllProperties()
// }

// function logProperties(){
//   const userProperties = PropertiesService.getUserProperties();

//   const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//   data.forEach(function(value, key){
//     Logger.log(value)
//     Logger.log(key)
//   })
// }

// function countProperties(){
//   const userProperties = PropertiesService.getUserProperties();
//   counts = {'mailto': 0, 'unsub_link': 0}
//   const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//   data.forEach(function(value, key){
//     if (value.mailto != 'not found'){
//       counts.mailto = counts.mailto += 1 
//     } 

//     if (value.unsub_link != 'not found'){
//       counts.unsub_link = counts.unsub_link += 1 
//     } 
//   })
//   Logger.log(counts)
// }

// function logMailtos(){
//   const userProperties = PropertiesService.getUserProperties();

//   const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//   data.forEach(function(value, key){
//     if (value.mailto != 'not found'){
//       Logger.log(value.mailto)
//     }
//   })
// }



/***
 * v14: 
  * Time Trigger (daily/hourly): trigger calls a function that updates properties (done)
 */

// function update_properties(){

//   // grab current properties
//   const userProperties = PropertiesService.getUserProperties();
  
//   // grab all new (1 day old) messages with unsubscribe 
//   const parameter = '+unsubscribe'+ '  newer_than:1d'
//   const newmessage_list = Gmail.Users.Messages.list('me', {
//     q: parameter,
//     pageToken: null,
//     maxResults: 500,
//   })
//   // Logger.log(newmessage_list)

//   // update userProperties if any new
//   const new_messages = newmessage_list.messages
//   if (new_messages){
//     const sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))

//     const updated_data = batchMessages(new_messages, sender_data)
//     // Logger.log(updated_data.entries())
//     const property_data = JSON.stringify(Array.from(updated_data.entries()));

//     userProperties.setProperty('sender_data', property_data);
    
//     // Logger.log('updated data')
//     // updated_data.forEach(function(value, key){
//     //   Logger.log(value)
//     //   Logger.log(key)
//     // })
//   }
// }

// /***
//  * v13: 
//   * search function 
//  */
// function search(e){
//   // Logger.log('search')

//   var input = e.formInput.search
//   // Logger.log(input)

//   if (input!=null){
//     const userProperties = PropertiesService.getUserProperties();
//     // Logger.log(userProperties.getProperties())

//     // create a card 
//     var card = CardService.newCardBuilder()

//     // create search bar 
//     const search = CardService.newCardSection()
//     .addWidget(CardService.newTextInput()
//       .setFieldName("search")
//       .setTitle("Search")
//       .setValue(input)
//       .setOnChangeAction(CardService.newAction().setFunctionName('search')))
//     card.addSection(search)

//     var search_results = CardService.newCardSection()
//     var success = false 

//     const sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//     const sorted_data = new Map([...sender_data].sort((a,b) => b[1].count - a[1].count));
//     sorted_data.forEach(function(value, key){
//       const email = value.email
//       if (key.includes(input) || email.includes(input)){
//         Logger.log(key)

//         var text = 'unsubscribe'
//         if (value.link == 'not found' && value.mailto == 'not found'){
//           text = 'Unsub Manually'
//         }
//         else if (value.link == 'not found' && value.mailto != 'not found'){
//           text = 'Unsubscribe (Mailto)'
//         }

//         search_results.addWidget(create_card(key, value))
//         search_results.addWidget(
//           CardService.newButtonSet()
//             .addButton(CardService.newTextButton()
//               .setText('Delete Emails')
//               .setOnClickAction(CardService.newAction().setFunctionName('delete_emails')
//               .setParameters({"email": value.email})))
//             .addButton(CardService.newTextButton()
//               .setText(text)
//               .setOnClickAction(CardService.newAction().setFunctionName('unsubscribe')
//               .setParameters({"link": value.link}))))
//         success=true
//       }
//     })

//     if(success){
//       card.addSection(search_results)
//       // Logger.log(match_keys)
//       return [card.build()]
//     }
//   }
// }

// function send_mailto(address, subject, body, bcc, cc) {
  
//   var message = 'MIME-Version: 1.0\r\n' +
//     'To: <' + address + '>\r\n' +
//     'cc: ' + cc + '\r\n' +
//     'bcc: ' + bcc + '\r\n' +
//     'Subject: ' + subject + '\r\n' +
//     'Content-Type: text/html; charset=UTF-8\r\n\r\n' + body + '\r\n'


//   var params = {
//     method: "post",
//     contentType: 'message/rfc822',
//     headers: {
//       "Authorization": "Bearer " + ScriptApp.getOAuthToken()
//     },
//     muteHttpExceptions: true,
//     payload: message
//   };

//   UrlFetchApp.fetch("https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send", params);
// }

// // mailto formatting: https://yoast.com/developer-blog/guide-mailto-links/
// function handle_mailto(mailto){
//   const subject_regex = /subject=([^&\s]+)/g
//   const body_regex = /&body=([^&\s]+)/g
//   const bcc_regex = /&bcc=([^&\s]+)/g
//   const cc_regex = /&cc=([^&\s]+)/g

//   // Logger.log(value.mailto)
//   const mailto_split = mailto.split('?')
//   const address = mailto_split[0]
//   // Logger.log(address)
//   var subject = ''
//   var body = ''
//   var bcc = ''
//   var cc = ''

//   const email_info = mailto_split[1]
//   if (email_info){
//     // Logger.log(email_info)
    
//     const subject_result = subject_regex.exec(email_info)
//     if (subject_result){
//       subject = subject_result[1]
//     }

//     const body_result = body_regex.exec(email_info)
//     if (body_result){
//       body = body_result[1]
//     }
    
//     const bcc_result = bcc_regex.exec(email_info)
//     if (bcc_result){
//       bcc = bcc_result[1]
//     }

//     const cc_result = cc_regex.exec(email_info)
//     if (cc_result){
//       cc = cc_result[1]
//     }
//   }
//   // Logger.log(address)
//   // Logger.log(subject)
//   // Logger.log(body)

//   send_mailto(address, subject, body, bcc, cc)

// }

// function unsubscribe(e){
//   // Logger.log('unsubscribe')
//   // Logger.log(e.parameters)
//   // Logger.log(e.parameters.link)

//   if(e.parameters.link != 'not found'){
//     return CardService.newActionResponseBuilder()
//       .setOpenLink(CardService.newOpenLink()
//           .setUrl(e.parameters.link))
//       .build();
//   }

//   else if (e.parameters.mailto != 'not found'){
//     handle_mailto(e.parameters.mailto)
//     return CardService.newActionResponseBuilder()
//       .setNotification(CardService.newNotification()
//           .setText('Unsubscribed through mailto!'))
//       .build();
//   }

//   else{
//     return CardService.newActionResponseBuilder()
//       .setOpenLink(CardService.newOpenLink()
//           .setUrl(e.parameters.search))
//       .build();
//   }
// } 

// function delete_emails(e){
//   Logger.log('delete_emails')
//   Logger.log(e.parameters)
//   Logger.log(e.parameters.email)

//   batch_trash(e.parameters.email)

//   text = "Deleted all emails from " + e.parameters.email

//   return CardService.newActionResponseBuilder()
//       .setNotification(CardService.newNotification()
//           .setText(text))
//       .build();
// }

// function batch_trash(address){
//   const parameter = 'from:'+ address
//   const messageList = Gmail.Users.Messages.list('me', {
//     q: parameter,
//     pageToken: null,
//     maxResults: 500,
//   })

//   const messages = messageList.messages
//   if (messages){
//     let message_ids = messages.map(message => message.id);
//   Logger.log(message_ids)

//   const messagesToDelete = {"ids": message_ids}
//   // Gmail.Users.Messages.batchDelete({"ids": message_ids}, "me") // permanently deletes emails (doesn't move to trash)

//   //create list of objects containing the requests 
//   var body = messages.map(function(message){
//     return {
//         method: "POST", 
//         endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + message.id + '/trash'
//     }
//   });
//   Logger.log(body)


//   // build out the rest of the requests for each request in body 
//   var boundary = "xxxxxxxxxx";
//   var contentId = 0;
//   var data = "--" + boundary + "\r\n";
//   for (var i in body) {
//     data += "Content-Type: application/http\r\n";
//     data += "Content-ID: " + ++contentId + "\r\n\r\n";
//     data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
//     data += "--" + boundary + "\r\n";
//   }
//   Logger.log(data)

//   const payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

//   // boilerplate for request 
//   const options = {
//     method: "post",
//     contentType: "multipart/mixed; boundary=" + boundary,
//     payload: payload,
//     headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
//     muteHttpExceptions: true,
//   };

//   //submit request 
//   const  url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
  
//   const res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
//   // Logger.log(res)

//   // //split into individual outputs 
//   // const dat = res.split("--batch");
//   // Logger.log(dat)
//   }

// }

// function create_card(key, value){
//   const email = value.email
//   const search = 'https://mail.google.com/mail/u/0/#search/from%3A+' + email
  
//   var text = '<b>' + '('+ value.count + ') ' + key + '<b>'
//   // if (value.link != 'not found'){
//   //   text = '<b>' + '('+ value.count + ') ' + key + '<b>'+ '<a href=' + value.mailto + '>unsubscribe</a>'
//   // } 

//   const email_card = CardService.newDecoratedText()
//     // .setText('<b>' + '('+ value.count + ') ' + key + '<b>')
//     .setText(text)
//     //.setText('<b>' + '('+ value.count + ') ' + key + '<b>'+ '<a href=' + value.link + '>unsubscribe</a>')
//     // <a href="http://www.google.com">google</a>
//     // var card_text = '<b>' + key + '<b>' + '<br>' + '<a href=' + value + '>unsubscribe</a>'

//     // .setText('<b>' + '('+ value.count + ') ' + key + '<b>' + '<br>' + value.link)
//     .setBottomLabel(email)
//     .setWrapText(true)
//     .setOpenLink(CardService.newOpenLink().setUrl(search))
//   return email_card
// }

// function batchMessages(messageList, sender_data) {

//   //create list of objects containing the requests 
//   var body = messageList.map(function(e){
//     return {
//         method: "GET",
//         endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + e.id
//     }
//   });
//   // Logger.log(body)


//   // build out the rest of the requests for each request in body 
//   var boundary = "xxxxxxxxxx";
//   var contentId = 0;
//   var data = "--" + boundary + "\r\n";
//   for (var i in body) {
//     data += "Content-Type: application/http\r\n";
//     data += "Content-ID: " + ++contentId + "\r\n\r\n";
//     data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
//     data += "--" + boundary + "\r\n";
//   }
//   // Logger.log(data)

//   var payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

//   // boilerplate for request 
//   var options = {
//     method: "post",
//     contentType: "multipart/mixed; boundary=" + boundary,
//     payload: payload,
//     headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
//     muteHttpExceptions: true,
//   };

//   //submit request 
//   var url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
  
//   var res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
//   // Logger.log(res)

//   //split into individual outputs 
//   var dat = res.split("--batch");
//   // Logger.log(dat)

//   // dat.ForEach(function(d){
//   //   Logger.log(d)
//   // })

//   // grab only the output, filtering out the headers 
//   var result = dat.slice(1, dat.length - 1).map(function(e){return e.match(/{[\S\s]+}/g)[0]});
  
//   result.map(function(e){
//     const sender_full = JSON.parse(e).payload.headers.find(item => item.name === 'From').value
//     const name = sender_full.replace(/<[^>]*>/g, "").replaceAll('"', '')

//     var unsub_array = JSON.parse(e).payload.headers.find(item => item.name === 'List-Unsubscribe')

//     var unsub_link = 'not found'
//     var mailto = 'not found'

//     if (unsub_array){
//       // Logger.log(unsub_array.value)f
//       const unsub_match = unsub_array.value.match(/https?:\/\/(.+?)(\s|,)/);
//       if (unsub_match) {
//         unsub_link = unsub_match[0];
//       }

//       const mailto_match = unsub_array.value.match(/mailto:(.+?)(\s|,|>)/);
//       // Logger.log(mailto_match)
//       // Logger.log(mailto_match)
//       if (mailto_match) {
//         // Logger.log(mailto_match[0])
//         mailto = mailto_match[1];
//         Logger.log(mailto)

//         // Logger.log(mailto)
//       }
//     }

//     if (sender_data.has(name)){
//       sender_values = sender_data.get(name)
//       sender_data.set(name, {'email': sender_values.email, 'count': sender_values.count+1, 'delete': false, 
//       'link': unsub_link, 'mailto': mailto})
//     }
//     else{
//       const email = sender_full.match(/<([^<]*)>/, "");
//       if (email){
//         // Logger.log(typeof email[0])
//         sender_data.set(name, {'email': email[1], 'count':1, 'delete':false, 'link': unsub_link, 'mailto': mailto})
//       }
//       else{
//         // Logger.log(typeof name)
//         sender_data.set(name, {'email': name, 'count':1, 'delete':false, 'link': unsub_link, 'mailto': mailto})
//       }
//     }
//   })

//   return sender_data
// }

// function email_counts(sender_data, pageToken){
//   // Logger.log('email counts start')
//   // Logger.log(sender_data)
//   // Logger.log(pageToken)

//   // scan 500 emails in 1 run, 500 at a time 
//   for (let i=0; i<1; i++){
//     // pull message id's 500 at a time 
//     var messageList = Gmail.Users.Messages.list('me', {
//         q: '+unsubscribe',
//         pageToken: pageToken,
//         maxResults: 500,
//         })
//     var messages = messageList.messages
//     // Logger.log(messages)

//     var messages_50 = [] // batch request messages 50 at a time 
//     while (messages.length){
//       // Logger.log(messages.length)
//       // Logger.log(messages.splice(0, 100))
//       messages_50.push(messages.splice(0, 50));
//     }
//     // Logger.log(messages_100.length)
    
//     // send requests for message headers in batches of 50 
//     messages_50.forEach(function(message_block){
//       // Logger.log('messages_50')
//       sender_data = batchMessages(message_block, sender_data)
//     })
//     Logger.log(pageToken)
//     pageToken = messageList.nextPageToken //reassign page token 
//     Logger.log(pageToken)
//   }

//   // Logger.log('data in email_counts')
//   // sender_data.forEach(function(value, key){
//   //   Logger.log(value)
//   //   Logger.log(key)
//   // })
//   return [sender_data, pageToken]
// }

// function run_zero(){
//   //get property if hasn't run already
//   const userProperties = PropertiesService.getUserProperties();
//   // Logger.log(userProperties.getProperties())

//   var sender_data;
//   var pageToken;

//   Logger.log(userProperties.getKeys())
//   Logger.log(userProperties.getKeys().length)

//   if (userProperties.getKeys().length ==2){
//     // map = new Map(JSON.parse(jsonText));
//     sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//     pageToken = userProperties.getProperty('pageToken')
//   }
//   else if (userProperties.getKeys().length ==1){
//     userProperties.setProperty('pageToken', '')
//     sender_data = new Map()
//   }
//   else{
//     sender_data = new Map()
//     pageToken = null
//   }

//   var cardHeader = CardService.newCardHeader()
//     .setTitle("Thanks for using Project Zero!")

//   var card = CardService.newCardBuilder()
//     .setHeader(cardHeader)

//   sender_data = email_counts(sender_data, pageToken)
//   // Logger.log('sender_data in run_zero')
//   // Logger.log(sender_data[0])
//   // Logger.log(sender_data[1])

//   const data = sender_data[0]
//   const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count));

//   sorted_data.forEach(function(value, key){
//       const home = CardService.newCardSection()
//         .addWidget(create_card(key, value))
//         .addWidget(
//           CardService.newButtonSet()
//             .addButton(CardService.newTextButton()
//               .setText('Delete Emails')
//               .setOnClickAction(CardService.newAction().setFunctionName('delete_emails')
//               .setParameters({"email": value.email})))
//             .addButton(CardService.newTextButton()
//               .setText('Unsub Manually')
//               .setOnClickAction(CardService.newAction().setFunctionName('unsubscribe')
//               .setParameters({"link": value.link}))))
//       card.addSection(home)
//   })
//   const property_data = JSON.stringify(Array.from(sender_data[0].entries()));
//   // Logger.log(property_data)
//   let button_text = ''

//   // Logger.log(sender_data[1])
//   if (sender_data[1]){
//     Logger.log('scan next 1000')
//     button_text = 'Scan Next 1000'
//     userProperties.setProperty('pageToken', sender_data[1])
//     // Logger.log(sender_data[1])
//     userProperties.setProperty('sender_data', property_data);
//   }
//   else{
//     button_text = 'Scan Complete! Run Again?'
//     userProperties.deleteProperty('pageToken')
//     userProperties.setProperty('sender_data', property_data);
//   }

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText(button_text)
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero")))
//   card.setFixedFooter(fixedFooter)

//   // set nav
//   var nav = CardService.newNavigation().updateCard(card.build());

//   return CardService.newActionResponseBuilder()
//       .setNavigation(nav)
//       .build();
// }

// function project_zero(){  
//   var card = CardService.newCardBuilder()
//   const search = CardService.newCardSection()
//   .addWidget(CardService.newTextInput()
//     .setFieldName("search")
//     .setTitle("Search")
//     .setOnChangeAction(CardService.newAction().setFunctionName('search')))
//   card.addSection(search)


    
//   const userProperties = PropertiesService.getUserProperties();
//   // Logger.log(Object.values(userProperties.getProperties()))  

//   if (userProperties.getKeys().length !=0){
//     const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//     const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count));

//     sorted_data.forEach(function(value, key){
      
//       const search = 'https://mail.google.com/mail/u/0/#search/from%3A+' + value.email
//       var text = 'unsubscribe'
//       if (value.link == 'not found' && value.mailto == 'not found'){
//         text = 'Unsub Manually'
//       }
//       else if (value.link == 'not found' && value.mailto != 'not found'){
//         text = 'Unsubscribe (Mailto)'
//       }

//       // Logger.log(value.link)
//       home = CardService.newCardSection()
//       .addWidget(create_card(key, value))
//       .addWidget(
//           CardService.newButtonSet()
//             .addButton(CardService.newTextButton()
//               .setText('Delete All')
//               .setOnClickAction(CardService.newAction().setFunctionName('delete_emails')
//               .setParameters({"email": value.email})))
//             .addButton(CardService.newTextButton()
//               .setText(text)
//               .setOnClickAction(CardService.newAction().setFunctionName('unsubscribe')
//               .setParameters({"link": value.link, 'mailto': value.mailto, 'search': search}))
//               ))
//       card.addSection(home)
//     })
//   }
  
//   // // create header 
//   // var cardHeader = CardService.newCardHeader()
//   //   .setTitle("Welcome to Project Zero! Each run scans 1000 emails. Run again if you have more!")

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setSecondaryButton(CardService.newTextButton().setText("Run Again")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero") ))
//     .setPrimaryButton(CardService.newTextButton().setText("Delete Emails")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("delete_emails") ))
  
//   // card.setHeader(cardHeader).build()
//   card.setFixedFooter(fixedFooter).build()

//   return [card.build()]
// }

// function deleteProperties(){
//   const userProperties = PropertiesService.getUserProperties();
//   userProperties.deleteAllProperties()
// }

// function logProperties(){
//   const userProperties = PropertiesService.getUserProperties();

//   const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//   data.forEach(function(value, key){
//     Logger.log(value)
//     Logger.log(key)
//   })
// }

// function countProperties(){
//   const userProperties = PropertiesService.getUserProperties();
//   counts = {'mailto': 0, 'unsub_link': 0}
//   const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//   data.forEach(function(value, key){
//     if (value.mailto != 'not found'){
//       counts.mailto = counts.mailto += 1 
//     } 

//     if (value.unsub_link != 'not found'){
//       counts.unsub_link = counts.unsub_link += 1 
//     } 
//   })
//   Logger.log(counts)
// }

// function logMailtos(){
  
//   const userProperties = PropertiesService.getUserProperties();

//   const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//   data.forEach(function(value, key){
//     if (value.mailto != 'not found'){
//       Logger.log(value.mailto)
//     }
//   })
// }

// /***
//  * v13: 
//   * search function 
//  */
// function search(e){
//   // Logger.log('search')

//   var input = e.formInput.search
//   // Logger.log(input)

//   if (input!=null){
//     const userProperties = PropertiesService.getUserProperties();
//     // Logger.log(userProperties.getProperties())

//     // create a card 
//     var card = CardService.newCardBuilder()

//     // create search bar 
//     const search = CardService.newCardSection()
//     .addWidget(CardService.newTextInput()
//       .setFieldName("search")
//       .setTitle("Search")
//       .setValue(input)
//       .setOnChangeAction(CardService.newAction().setFunctionName('search')))
//     card.addSection(search)

//     var search_results = CardService.newCardSection()
//     var success = false 

//     const sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//     const sorted_data = new Map([...sender_data].sort((a,b) => b[1].count - a[1].count));
//     sorted_data.forEach(function(value, key){
//       const email = value.email
//       if (key.includes(input) || email.includes(input)){
//         Logger.log(key)
//         search_results.addWidget(create_card(key, value))
//         search_results.addWidget(
//           CardService.newButtonSet()
//             .addButton(CardService.newTextButton()
//               .setText('Delete Emails')
//               .setOnClickAction(CardService.newAction().setFunctionName('delete_emails')
//               .setParameters({"email": value.email})))
//             .addButton(CardService.newTextButton()
//               .setText('Unsub Manually')
//               .setOnClickAction(CardService.newAction().setFunctionName('unsubscribe')
//               .setParameters({"link": value.link}))))
//         success=true
//       }
//     })

//     if(success){
//       card.addSection(search_results)
//       // Logger.log(match_keys)
//       return [card.build()]
//     }
//   }

  

  
//   // return CardService.newActionResponseBuilder()
//   //     .setNotification(CardService.newNotification()
//   //         .setText('Search: '+input))
//   //     .build();
// }

// function send_mailto(address, subject, body, bcc, cc) {
  
//   var message = 'MIME-Version: 1.0\r\n' +
//     'To: <' + address + '>\r\n' +
//     'cc: ' + cc + '\r\n' +
//     'bcc: ' + bcc + '\r\n' +
//     'Subject: ' + subject + '\r\n' +
//     'Content-Type: text/html; charset=UTF-8\r\n\r\n' + body + '\r\n'


//   var params = {
//     method: "post",
//     contentType: 'message/rfc822',
//     headers: {
//       "Authorization": "Bearer " + ScriptApp.getOAuthToken()
//     },
//     muteHttpExceptions: true,
//     payload: message
//   };

//   UrlFetchApp.fetch("https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send", params);
// }

// // mailto formatting: https://yoast.com/developer-blog/guide-mailto-links/
// function handle_mailto(mailto){
//   const subject_regex = /subject=([^&\s]+)/g
//   const body_regex = /&body=([^&\s]+)/g
//   const bcc_regex = /&bcc=([^&\s]+)/g
//   const cc_regex = /&cc=([^&\s]+)/g

//   // Logger.log(value.mailto)
//   const mailto_split = mailto.split('?')
//   const address = mailto_split[0]
//   // Logger.log(address)
//   var subject = ''
//   var body = ''
//   var bcc = ''
//   var cc = ''

//   const email_info = mailto_split[1]
//   if (email_info){
//     // Logger.log(email_info)
    
//     const subject_result = subject_regex.exec(email_info)
//     if (subject_result){
//       subject = subject_result[1]
//     }

//     const body_result = body_regex.exec(email_info)
//     if (body_result){
//       body = body_result[1]
//     }
    
//     const bcc_result = bcc_regex.exec(email_info)
//     if (bcc_result){
//       bcc = bcc_result[1]
//     }

//     const cc_result = cc_regex.exec(email_info)
//     if (cc_result){
//       cc = cc_result[1]
//     }
//   }
//   // Logger.log(address)
//   // Logger.log(subject)
//   // Logger.log(body)

//   send_mailto(address, subject, body, bcc, cc)

// }

// function unsubscribe(e){
//   // Logger.log('unsubscribe')
//   // Logger.log(e.parameters)
//   // Logger.log(e.parameters.link)

//   if(e.parameters.link != 'not found'){
//     return CardService.newActionResponseBuilder()
//       .setOpenLink(CardService.newOpenLink()
//           .setUrl(e.parameters.link))
//       .build();
//   }

//   else if (e.parameters.mailto != 'not found'){
//     handle_mailto(e.parameters.mailto)
//     return CardService.newActionResponseBuilder()
//       .setNotification(CardService.newNotification()
//           .setText('Unsubscribed through mailto!'))
//       .build();
//   }

//   else{
//     return CardService.newActionResponseBuilder()
//       .setOpenLink(CardService.newOpenLink()
//           .setUrl(e.parameters.search))
//       .build();
//   }
// } 

// function delete_emails(e){
//   Logger.log('delete_emails')
//   Logger.log(e.parameters)
//   Logger.log(e.parameters.email)

//   batch_trash(e.parameters.email)

//   text = "Deleted all emails from " + e.parameters.email

//   return CardService.newActionResponseBuilder()
//       .setNotification(CardService.newNotification()
//           .setText(text))
//       .build();
// }

// function batch_trash(address){
//   const parameter = 'from:'+ address
//   const messageList = Gmail.Users.Messages.list('me', {
//     q: parameter,
//     pageToken: null,
//     maxResults: 500,
//   })

//   const messages = messageList.messages
//   if (messages){
//     let message_ids = messages.map(message => message.id);
//   Logger.log(message_ids)

//   const messagesToDelete = {"ids": message_ids}
//   // Gmail.Users.Messages.batchDelete({"ids": message_ids}, "me") // permanently deletes emails (doesn't move to trash)

//   //create list of objects containing the requests 
//   var body = messages.map(function(message){
//     return {
//         method: "POST", 
//         endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + message.id + '/trash'
//     }
//   });
//   Logger.log(body)


//   // build out the rest of the requests for each request in body 
//   var boundary = "xxxxxxxxxx";
//   var contentId = 0;
//   var data = "--" + boundary + "\r\n";
//   for (var i in body) {
//     data += "Content-Type: application/http\r\n";
//     data += "Content-ID: " + ++contentId + "\r\n\r\n";
//     data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
//     data += "--" + boundary + "\r\n";
//   }
//   Logger.log(data)

//   const payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

//   // boilerplate for request 
//   const options = {
//     method: "post",
//     contentType: "multipart/mixed; boundary=" + boundary,
//     payload: payload,
//     headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
//     muteHttpExceptions: true,
//   };

//   //submit request 
//   const  url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
  
//   const res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
//   // Logger.log(res)

//   // //split into individual outputs 
//   // const dat = res.split("--batch");
//   // Logger.log(dat)
//   }

// }

// function create_card(key, value){
//   const email = value.email
//   const search = 'https://mail.google.com/mail/u/0/#search/from%3A+' + email
  
//   var text = '<b>' + '('+ value.count + ') ' + key + '<b>'
//   // if (value.link != 'not found'){
//   //   text = '<b>' + '('+ value.count + ') ' + key + '<b>'+ '<a href=' + value.mailto + '>unsubscribe</a>'
//   // } 

//   const email_card = CardService.newDecoratedText()
//     // .setText('<b>' + '('+ value.count + ') ' + key + '<b>')
//     .setText(text)
//     //.setText('<b>' + '('+ value.count + ') ' + key + '<b>'+ '<a href=' + value.link + '>unsubscribe</a>')
//     // <a href="http://www.google.com">google</a>
//     // var card_text = '<b>' + key + '<b>' + '<br>' + '<a href=' + value + '>unsubscribe</a>'

//     // .setText('<b>' + '('+ value.count + ') ' + key + '<b>' + '<br>' + value.link)
//     .setBottomLabel(email)
//     .setWrapText(true)
//     .setOpenLink(CardService.newOpenLink().setUrl(search))
//   return email_card
// }

// function batchMessages(messageList, sender_data) {

//   //create list of objects containing the requests 
//   var body = messageList.map(function(e){
//     return {
//         method: "GET",
//         endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + e.id
//     }
//   });
//   // Logger.log(body)


//   // build out the rest of the requests for each request in body 
//   var boundary = "xxxxxxxxxx";
//   var contentId = 0;
//   var data = "--" + boundary + "\r\n";
//   for (var i in body) {
//     data += "Content-Type: application/http\r\n";
//     data += "Content-ID: " + ++contentId + "\r\n\r\n";
//     data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
//     data += "--" + boundary + "\r\n";
//   }
//   // Logger.log(data)

//   var payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

//   // boilerplate for request 
//   var options = {
//     method: "post",
//     contentType: "multipart/mixed; boundary=" + boundary,
//     payload: payload,
//     headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
//     muteHttpExceptions: true,
//   };

//   //submit request 
//   var url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
  
//   var res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
//   // Logger.log(res)

//   //split into individual outputs 
//   var dat = res.split("--batch");
//   // Logger.log(dat)

//   // dat.ForEach(function(d){
//   //   Logger.log(d)
//   // })

//   // grab only the output, filtering out the headers 
//   var result = dat.slice(1, dat.length - 1).map(function(e){return e.match(/{[\S\s]+}/g)[0]});
  
//   result.map(function(e){
//     const sender_full = JSON.parse(e).payload.headers.find(item => item.name === 'From').value
//     const name = sender_full.replace(/<[^>]*>/g, "").replaceAll('"', '')

//     var unsub_array = JSON.parse(e).payload.headers.find(item => item.name === 'List-Unsubscribe')

//     var unsub_link = 'not found'
//     var mailto = 'not found'

//     if (unsub_array){
//       // Logger.log(unsub_array.value)f
//       const unsub_match = unsub_array.value.match(/https?:\/\/(.+?)(\s|,)/);
//       if (unsub_match) {
//         unsub_link = unsub_match[0];
//       }

//       const mailto_match = unsub_array.value.match(/mailto:(.+?)(\s|,|>)/);
//       // Logger.log(mailto_match)
//       // Logger.log(mailto_match)
//       if (mailto_match) {
//         // Logger.log(mailto_match[0])
//         mailto = mailto_match[1];
//         Logger.log(mailto)

//         // Logger.log(mailto)
//       }
//     }

//     if (sender_data.has(name)){
//       sender_values = sender_data.get(name)
//       sender_data.set(name, {'email': sender_values.email, 'count': sender_values.count+1, 'delete': false, 
//       'link': unsub_link, 'mailto': mailto})
//     }
//     else{
//       const email = sender_full.match(/<([^<]*)>/, "");
//       if (email){
//         // Logger.log(typeof email[0])
//         sender_data.set(name, {'email': email[1], 'count':1, 'delete':false, 'link': unsub_link, 'mailto': mailto})
//       }
//       else{
//         // Logger.log(typeof name)
//         sender_data.set(name, {'email': name, 'count':1, 'delete':false, 'link': unsub_link, 'mailto': mailto})
//       }
//     }
//   })

//   return sender_data
// }

// function email_counts(sender_data, pageToken){
//   // Logger.log('email counts start')
//   // Logger.log(sender_data)
//   // Logger.log(pageToken)

//   // scan 500 emails in 1 run, 500 at a time 
//   for (let i=0; i<1; i++){
//     // pull message id's 500 at a time 
//     var messageList = Gmail.Users.Messages.list('me', {
//         q: '+unsubscribe',
//         pageToken: pageToken,
//         maxResults: 500,
//         })
//     var messages = messageList.messages
//     // Logger.log(messages)

//     var messages_50 = [] // batch request messages 50 at a time 
//     while (messages.length){
//       // Logger.log(messages.length)
//       // Logger.log(messages.splice(0, 100))
//       messages_50.push(messages.splice(0, 50));
//     }
//     // Logger.log(messages_100.length)
    
//     // send requests for message headers in batches of 50 
//     messages_50.forEach(function(message_block){
//       // Logger.log('messages_50')
//       sender_data = batchMessages(message_block, sender_data)
//     })
//     Logger.log(pageToken)
//     pageToken = messageList.nextPageToken //reassign page token 
//     Logger.log(pageToken)
//   }

//   // Logger.log('data in email_counts')
//   // sender_data.forEach(function(value, key){
//   //   Logger.log(value)
//   //   Logger.log(key)
//   // })
//   return [sender_data, pageToken]
// }

// function run_zero(){
//   //get property if hasn't run already
//   const userProperties = PropertiesService.getUserProperties();
//   // Logger.log(userProperties.getProperties())

//   var sender_data;
//   var pageToken;

//   Logger.log(userProperties.getKeys())
//   Logger.log(userProperties.getKeys().length)

//   if (userProperties.getKeys().length ==2){
//     // map = new Map(JSON.parse(jsonText));
//     sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//     pageToken = userProperties.getProperty('pageToken')
//   }
//   else if (userProperties.getKeys().length ==1){
//     userProperties.setProperty('pageToken', '')
//     sender_data = new Map()
//   }
//   else{
//     sender_data = new Map()
//     pageToken = null
//   }

//   var cardHeader = CardService.newCardHeader()
//     .setTitle("Thanks for using Project Zero!")

//   var card = CardService.newCardBuilder()
//     .setHeader(cardHeader)

//   sender_data = email_counts(sender_data, pageToken)
//   // Logger.log('sender_data in run_zero')
//   // Logger.log(sender_data[0])
//   // Logger.log(sender_data[1])

//   const data = sender_data[0]
//   const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count));

//   sorted_data.forEach(function(value, key){
//       const home = CardService.newCardSection()
//         .addWidget(create_card(key, value))
//         .addWidget(
//           CardService.newButtonSet()
//             .addButton(CardService.newTextButton()
//               .setText('Delete Emails')
//               .setOnClickAction(CardService.newAction().setFunctionName('delete_emails')
//               .setParameters({"email": value.email})))
//             .addButton(CardService.newTextButton()
//               .setText('Unsub Manually')
//               .setOnClickAction(CardService.newAction().setFunctionName('unsubscribe')
//               .setParameters({"link": value.link}))))
//       card.addSection(home)
//   })
//   const property_data = JSON.stringify(Array.from(sender_data[0].entries()));
//   // Logger.log(property_data)
//   let button_text = ''

//   // Logger.log(sender_data[1])
//   if (sender_data[1]){
//     Logger.log('scan next 1000')
//     button_text = 'Scan Next 1000'
//     userProperties.setProperty('pageToken', sender_data[1])
//     // Logger.log(sender_data[1])
//     userProperties.setProperty('sender_data', property_data);
//   }
//   else{
//     button_text = 'Scan Complete! Run Again?'
//     userProperties.deleteProperty('pageToken')
//     userProperties.setProperty('sender_data', property_data);
//   }

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText(button_text)
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero")))
//   card.setFixedFooter(fixedFooter)

//   // set nav
//   var nav = CardService.newNavigation().updateCard(card.build());

//   return CardService.newActionResponseBuilder()
//       .setNavigation(nav)
//       .build();
// }

// function project_zero(){  
//   var card = CardService.newCardBuilder()
//   const search = CardService.newCardSection()
//   .addWidget(CardService.newTextInput()
//     .setFieldName("search")
//     .setTitle("Search")
//     .setOnChangeAction(CardService.newAction().setFunctionName('search')))
//   card.addSection(search)


    
//   const userProperties = PropertiesService.getUserProperties();
//   // Logger.log(Object.values(userProperties.getProperties()))  

//   if (userProperties.getKeys().length !=0){
//     const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//     const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count));

//     sorted_data.forEach(function(value, key){
      
//       const search = 'https://mail.google.com/mail/u/0/#search/from%3A+' + value.email
//       var text = 'unsubscribe'
//       if (value.link == 'not found' && value.mailto == 'not found'){
//         text = 'Unsub Manually'
//       }
//       else if (value.link == 'not found' && value.mailto != 'not found'){
//         text = 'Unsubscribe (Mailto)'
//       }

//       // Logger.log(value.link)
//       home = CardService.newCardSection()
//       .addWidget(create_card(key, value))
//       .addWidget(
//           CardService.newButtonSet()
//             .addButton(CardService.newTextButton()
//               .setText('Delete All')
//               .setOnClickAction(CardService.newAction().setFunctionName('delete_emails')
//               .setParameters({"email": value.email})))
//             .addButton(CardService.newTextButton()
//               .setText(text)
//               .setOnClickAction(CardService.newAction().setFunctionName('unsubscribe')
//               .setParameters({"link": value.link, 'mailto': value.mailto, 'search': search}))
//               ))
//       card.addSection(home)
//     })
//   }
  
//   // // create header 
//   // var cardHeader = CardService.newCardHeader()
//   //   .setTitle("Welcome to Project Zero! Each run scans 1000 emails. Run again if you have more!")

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setSecondaryButton(CardService.newTextButton().setText("Run Again")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero") ))
//     .setPrimaryButton(CardService.newTextButton().setText("Delete Emails")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("delete_emails") ))
  
//   // card.setHeader(cardHeader).build()
//   card.setFixedFooter(fixedFooter).build()

//   return [card.build()]
// }

// function deleteProperties(){
//   const userProperties = PropertiesService.getUserProperties();
//   userProperties.deleteAllProperties()
// }

// function logProperties(){
//   const userProperties = PropertiesService.getUserProperties();

//   const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//   data.forEach(function(value, key){
//     Logger.log(value)
//     Logger.log(key)
//   })
// }

// function countProperties(){
//   const userProperties = PropertiesService.getUserProperties();
//   counts = {'mailto': 0, 'unsub_link': 0}
//   const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//   data.forEach(function(value, key){
//     if (value.mailto != 'not found'){
//       counts.mailto = counts.mailto += 1 
//     } 

//     if (value.unsub_link != 'not found'){
//       counts.unsub_link = counts.unsub_link += 1 
//     } 
//   })
//   Logger.log(counts)
// }

// function logMailtos(){
  
//   const userProperties = PropertiesService.getUserProperties();

//   const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//   data.forEach(function(value, key){
//     if (value.mailto != 'not found'){
//       Logger.log(value.mailto)
//     }
//   })
// }
// /***
//  * v12: 
//   * button set in each card (done)
//   * buttons: delete emails and unsubscribe (done)
//   * unsubscribe: notification if null, redirect link if link, send email if email, send notification (done)
//   * properties redesign: (done)
//     * 1st load: nothing in properties 
//     * each run: 
//       * check if properties: 
//         if property keys = None, set start and properties to ''
//         if property keys length = 2: in the middle of a run 
//         if property keys length = 1: run again from beginning 
//  */

// function send_mailto(address, subject, body, bcc, cc) {
  
//   var message = 'MIME-Version: 1.0\r\n' +
//     'To: <' + address + '>\r\n' +
//     'cc: ' + cc + '\r\n' +
//     'bcc: ' + bcc + '\r\n' +
//     'Subject: ' + subject + '\r\n' +
//     'Content-Type: text/html; charset=UTF-8\r\n\r\n' + body + '\r\n'


//   var params = {
//     method: "post",
//     contentType: 'message/rfc822',
//     headers: {
//       "Authorization": "Bearer " + ScriptApp.getOAuthToken()
//     },
//     muteHttpExceptions: true,
//     payload: message
//   };

//   UrlFetchApp.fetch("https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send", params);
// }

// // mailto formatting: https://yoast.com/developer-blog/guide-mailto-links/
// function handle_mailto(mailto){
//   const subject_regex = /subject=([^&\s]+)/g
//   const body_regex = /&body=([^&\s]+)/g
//   const bcc_regex = /&bcc=([^&\s]+)/g
//   const cc_regex = /&cc=([^&\s]+)/g

//   // Logger.log(value.mailto)
//   const mailto_split = mailto.split('?')
//   const address = mailto_split[0]
//   // Logger.log(address)
//   var subject = ''
//   var body = ''
//   var bcc = ''
//   var cc = ''

//   const email_info = mailto_split[1]
//   if (email_info){
//     // Logger.log(email_info)
    
//     const subject_result = subject_regex.exec(email_info)
//     if (subject_result){
//       subject = subject_result[1]
//     }

//     const body_result = body_regex.exec(email_info)
//     if (body_result){
//       body = body_result[1]
//     }
    
//     const bcc_result = bcc_regex.exec(email_info)
//     if (bcc_result){
//       bcc = bcc_result[1]
//     }

//     const cc_result = cc_regex.exec(email_info)
//     if (cc_result){
//       cc = cc_result[1]
//     }
//   }
//   // Logger.log(address)
//   // Logger.log(subject)
//   // Logger.log(body)

//   send_mailto(address, subject, body, bcc, cc)

// }

// function unsubscribe(e){
//   // Logger.log('unsubscribe')
//   // Logger.log(e.parameters)
//   // Logger.log(e.parameters.link)

//   if(e.parameters.link != 'not found'){
//     return CardService.newActionResponseBuilder()
//       .setOpenLink(CardService.newOpenLink()
//           .setUrl(e.parameters.link))
//       .build();
//   }

//   else if (e.parameters.mailto != 'not found'){
//     handle_mailto(e.parameters.mailto)
//     return CardService.newActionResponseBuilder()
//       .setNotification(CardService.newNotification()
//           .setText('Unsubscribed through mailto!'))
//       .build();
//   }

//   else{
//     return CardService.newActionResponseBuilder()
//       .setOpenLink(CardService.newOpenLink()
//           .setUrl(e.parameters.search))
//       .build();
//   }
// } 

// function delete_emails(e){
//   Logger.log('delete_emails')
//   Logger.log(e.parameters)
//   Logger.log(e.parameters.email)

//   text = "Deleted all emails from " + e.parameters.email

//   return CardService.newActionResponseBuilder()
//       .setNotification(CardService.newNotification()
//           .setText(text))
//       .build();

//   // set parameter of search 
//   const parameter = 'from:'+ e.parameters.email
//   // Logger.log(parameter)
//   var messageList = Gmail.Users.Messages.list('me', {
//         q: parameter,
//         pageToken: null,
//         maxResults: 500,
//         })
//   // Logger.log(messageList)



//   // // remove from properties 
//   //   userProperties.deleteProperty(key)
// }

// function batch_delete(e){
//   //create list of objects containing the requests 
//   var body = messageList.map(function(e){
//     return {
//         method: "DELETE", //trash??
//         endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + e.id
//     }
//   });
//   // Logger.log(body)


//   // build out the rest of the requests for each request in body 
//   var boundary = "xxxxxxxxxx";
//   var contentId = 0;
//   var data = "--" + boundary + "\r\n";
//   for (var i in body) {
//     data += "Content-Type: application/http\r\n";
//     data += "Content-ID: " + ++contentId + "\r\n\r\n";
//     data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
//     data += "--" + boundary + "\r\n";
//   }
//   // Logger.log(data)

//   var payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

//   // boilerplate for request 
//   var options = {
//     method: "post",
//     contentType: "multipart/mixed; boundary=" + boundary,
//     payload: payload,
//     headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
//     muteHttpExceptions: true,
//   };

//   //submit request 
//   var url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
  
//   var res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
//   // Logger.log(res)

//   //split into individual outputs 
//   var dat = res.split("--batch");
//   // Logger.log(dat)

//   // dat.ForEach(function(d){
//   //   Logger.log(d)
//   // })

//   // grab only the output, filtering out the headers 
//   var result = dat.slice(1, dat.length - 1).map(function(e){return e.match(/{[\S\s]+}/g)[0]});
//   // Logger.log(result[0])
//   // Logger.log(JSON.parse(result[0]).payload.headers.find(item => item.name === 'List-Unsubscribe'))
  
//   // record info
//   // Logger.log('batchMessages sender_data')
//   // Logger.log(sender_data)
//   result.map(function(e){
//     const sender_full = JSON.parse(e).payload.headers.find(item => item.name === 'From').value
//     const name = sender_full.replace(/<[^>]*>/g, "").replaceAll('"', '')

//     const unsub_link = JSON.parse(e).payload.headers.find(item => item.name === 'List-Unsubscribe')
//     //null, mailto, link
    
//     if(typeof unsub_link !== 'undefined'){
//       // Logger.log(unsub_link.value)
//     }
//     else{
//       // Logger.log(unsub_link)
//     }

//     if (sender_data.has(name)){
//       sender_values = sender_data.get(name)
//       sender_data.set(name, {'email': sender_values.email, 'count': sender_values.count+1, 'delete': false, 'link': unsub_link})
//     }
//     else{
//       const email = sender_full.match(/<([^<]*)>/, "");
//       if (email){
//         // Logger.log(typeof email[0])
//         sender_data.set(name, {'email': email[1], 'count':1, 'delete':false, 'link': unsub_link})
//       }
//       else{
//         // Logger.log(typeof name)
//         sender_data.set(name, {'email': name, 'count':1, 'delete':false, 'link': unsub_link})
//       }
//     }
//   })
//   return sender_data
// }

// function create_card(key, value){
//   const email = value.email
//   const search = 'https://mail.google.com/mail/u/0/#search/from%3A+' + email
  
//   var text = '<b>' + '('+ value.count + ') ' + key + '<b>'
//   // if (value.link != 'not found'){
//   //   text = '<b>' + '('+ value.count + ') ' + key + '<b>'+ '<a href=' + value.mailto + '>unsubscribe</a>'
//   // } 

//   const email_card = CardService.newDecoratedText()
//     // .setText('<b>' + '('+ value.count + ') ' + key + '<b>')
//     .setText(text)
//     //.setText('<b>' + '('+ value.count + ') ' + key + '<b>'+ '<a href=' + value.link + '>unsubscribe</a>')
//     // <a href="http://www.google.com">google</a>
//     // var card_text = '<b>' + key + '<b>' + '<br>' + '<a href=' + value + '>unsubscribe</a>'

//     // .setText('<b>' + '('+ value.count + ') ' + key + '<b>' + '<br>' + value.link)
//     .setBottomLabel(email)
//     .setWrapText(true)
//     .setOpenLink(CardService.newOpenLink().setUrl(search))
//   return email_card
// }

// function batchMessages(messageList, sender_data) {

//   //create list of objects containing the requests 
//   var body = messageList.map(function(e){
//     return {
//         method: "GET",
//         endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + e.id
//     }
//   });
//   // Logger.log(body)


//   // build out the rest of the requests for each request in body 
//   var boundary = "xxxxxxxxxx";
//   var contentId = 0;
//   var data = "--" + boundary + "\r\n";
//   for (var i in body) {
//     data += "Content-Type: application/http\r\n";
//     data += "Content-ID: " + ++contentId + "\r\n\r\n";
//     data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
//     data += "--" + boundary + "\r\n";
//   }
//   // Logger.log(data)

//   var payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

//   // boilerplate for request 
//   var options = {
//     method: "post",
//     contentType: "multipart/mixed; boundary=" + boundary,
//     payload: payload,
//     headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
//     muteHttpExceptions: true,
//   };

//   //submit request 
//   var url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
  
//   var res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
//   // Logger.log(res)

//   //split into individual outputs 
//   var dat = res.split("--batch");
//   // Logger.log(dat)

//   // dat.ForEach(function(d){
//   //   Logger.log(d)
//   // })

//   // grab only the output, filtering out the headers 
//   var result = dat.slice(1, dat.length - 1).map(function(e){return e.match(/{[\S\s]+}/g)[0]});
  
//   result.map(function(e){
//     const sender_full = JSON.parse(e).payload.headers.find(item => item.name === 'From').value
//     const name = sender_full.replace(/<[^>]*>/g, "").replaceAll('"', '')

//     var unsub_array = JSON.parse(e).payload.headers.find(item => item.name === 'List-Unsubscribe')

//     var unsub_link = 'not found'
//     var mailto = 'not found'

//     if (unsub_array){
//       // Logger.log(unsub_array.value)f
//       const unsub_match = unsub_array.value.match(/https?:\/\/(.+?)(\s|,)/);
//       if (unsub_match) {
//         unsub_link = unsub_match[0];
//       }

//       const mailto_match = unsub_array.value.match(/mailto:(.+?)(\s|,|>)/);
//       // Logger.log(mailto_match)
//       // Logger.log(mailto_match)
//       if (mailto_match) {
//         // Logger.log(mailto_match[0])
//         mailto = mailto_match[1];
//         Logger.log(mailto)

//         // Logger.log(mailto)
//       }
//     }

//     if (sender_data.has(name)){
//       sender_values = sender_data.get(name)
//       sender_data.set(name, {'email': sender_values.email, 'count': sender_values.count+1, 'delete': false, 
//       'link': unsub_link, 'mailto': mailto})
//     }
//     else{
//       const email = sender_full.match(/<([^<]*)>/, "");
//       if (email){
//         // Logger.log(typeof email[0])
//         sender_data.set(name, {'email': email[1], 'count':1, 'delete':false, 'link': unsub_link, 'mailto': mailto})
//       }
//       else{
//         // Logger.log(typeof name)
//         sender_data.set(name, {'email': name, 'count':1, 'delete':false, 'link': unsub_link, 'mailto': mailto})
//       }
//     }
//   })

//   return sender_data
// }

// function email_counts(sender_data, pageToken){
//   // Logger.log('email counts start')
//   // Logger.log(sender_data)
//   // Logger.log(pageToken)

//   // scan 500 emails in 1 run, 500 at a time 
//   for (let i=0; i<1; i++){
//     // pull message id's 500 at a time 
//     var messageList = Gmail.Users.Messages.list('me', {
//         q: '+unsubscribe',
//         pageToken: pageToken,
//         maxResults: 500,
//         })
//     var messages = messageList.messages
//     // Logger.log(messages)

//     var messages_50 = [] // batch request messages 50 at a time 
//     while (messages.length){
//       // Logger.log(messages.length)
//       // Logger.log(messages.splice(0, 100))
//       messages_50.push(messages.splice(0, 50));
//     }
//     // Logger.log(messages_100.length)
    
//     // send requests for message headers in batches of 50 
//     messages_50.forEach(function(message_block){
//       // Logger.log('messages_50')
//       sender_data = batchMessages(message_block, sender_data)
//     })
//     Logger.log(pageToken)
//     pageToken = messageList.nextPageToken //reassign page token 
//     Logger.log(pageToken)
//   }

//   // Logger.log('data in email_counts')
//   // sender_data.forEach(function(value, key){
//   //   Logger.log(value)
//   //   Logger.log(key)
//   // })
//   return [sender_data, pageToken]
// }

// function run_zero(){
//   //get property if hasn't run already
//   const userProperties = PropertiesService.getUserProperties();
//   // Logger.log(userProperties.getProperties())

//   var sender_data;
//   var pageToken;

//   Logger.log(userProperties.getKeys())
//   Logger.log(userProperties.getKeys().length)

//   if (userProperties.getKeys().length ==2){
//     // map = new Map(JSON.parse(jsonText));
//     sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//     pageToken = userProperties.getProperty('pageToken')
//   }
//   else if (userProperties.getKeys().length ==1){
//     userProperties.setProperty('pageToken', '')
//     sender_data = new Map()
//   }
//   else{
//     sender_data = new Map()
//     pageToken = null
//   }

//   var cardHeader = CardService.newCardHeader()
//     .setTitle("Thanks for using Project Zero!")

//   var card = CardService.newCardBuilder()
//     .setHeader(cardHeader)

//   sender_data = email_counts(sender_data, pageToken)
//   // Logger.log('sender_data in run_zero')
//   // Logger.log(sender_data[0])
//   // Logger.log(sender_data[1])
//   const data = sender_data[0]


//   const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count));
//   sorted_data.forEach(function(value, key){
//       const home = CardService.newCardSection()
//         .addWidget(create_card(key, value))
//         .addWidget(
//           CardService.newButtonSet()
//             .addButton(CardService.newTextButton()
//               .setText('Delete Emails')
//               .setOnClickAction(CardService.newAction().setFunctionName('delete_emails')
//               .setParameters({"email": value.email})))
//             .addButton(CardService.newTextButton()
//               .setText('Unsub Manually')
//               .setOnClickAction(CardService.newAction().setFunctionName('unsubscribe')
//               .setParameters({"link": value.link}))))
//       card.addSection(home)
//   })
//   const property_data = JSON.stringify(Array.from(sender_data[0].entries()));
//   // Logger.log(property_data)
//   let button_text = ''

//   // Logger.log(sender_data[1])
//   if (sender_data[1]){
//     Logger.log('scan next 1000')
//     button_text = 'Scan Next 1000'
//     userProperties.setProperty('pageToken', sender_data[1])
//     // Logger.log(sender_data[1])
//     userProperties.setProperty('sender_data', property_data);
//   }
//   else{
//     button_text = 'Scan Complete! Run Again?'
//     userProperties.deleteProperty('pageToken')
//     userProperties.setProperty('sender_data', property_data);
//   }

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText(button_text)
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero")))
//   card.setFixedFooter(fixedFooter)

//   // set nav
//   var nav = CardService.newNavigation().updateCard(card.build());

//   return CardService.newActionResponseBuilder()
//       .setNavigation(nav)
//       .build();
// }

// function project_zero(){  
//   var card = CardService.newCardBuilder()
//   const userProperties = PropertiesService.getUserProperties();
//   // Logger.log(Object.values(userProperties.getProperties()))  

//   if (userProperties.getKeys().length !=0){
//     const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//     const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count));

//     sorted_data.forEach(function(value, key){
      
//       const search = 'https://mail.google.com/mail/u/0/#search/from%3A+' + value.email
//       var text = 'unsubscribe'
//       if (value.link == 'not found' && value.mailto == 'not found'){
//         text = 'Unsub Manually'
//       }
//       else if (value.link == 'not found' && value.mailto != 'not found'){
//         text = 'Unsubscribe (Mailto)'
//       }

//       // Logger.log(value.link)
//       home = CardService.newCardSection()
//       .addWidget(create_card(key, value))
//       .addWidget(
//           CardService.newButtonSet()
//             .addButton(CardService.newTextButton()
//               .setText('Delete All')
//               .setOnClickAction(CardService.newAction().setFunctionName('delete_emails')
//               .setParameters({"email": value.email})))
//             .addButton(CardService.newTextButton()
//               .setText(text)
//               // .setOpenLink(CardService.newOpenLink()
//               //   .setURL(value.link))
//               .setOnClickAction(CardService.newAction().setFunctionName('unsubscribe')
//               .setParameters({"link": value.link, 'mailto': value.mailto, 'search': search}))
//               ))
//       card.addSection(home)
//     })
//   }
  
//   // // create header 
//   var cardHeader = CardService.newCardHeader()
//     .setTitle("Welcome to Project Zero! Each run scans 1000 emails. Run again if you have more!")

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setSecondaryButton(CardService.newTextButton().setText("Run Again")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero") ))
//     .setPrimaryButton(CardService.newTextButton().setText("Delete Emails")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("delete_emails") ))
  
//   card.setHeader(cardHeader).build()
//   card.setFixedFooter(fixedFooter).build()

//   return [card.build()]
// }

// function deleteProperties(){
//   const userProperties = PropertiesService.getUserProperties();
//   userProperties.deleteAllProperties()
// }

// function logProperties(){
//   const userProperties = PropertiesService.getUserProperties();

//   const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//   data.forEach(function(value, key){
//     Logger.log(value)
//     Logger.log(key)
//   })
// }

// function countProperties(){
//   const userProperties = PropertiesService.getUserProperties();
//   counts = {'mailto': 0, 'unsub_link': 0}
//   const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//   data.forEach(function(value, key){
//     if (value.mailto != 'not found'){
//       counts.mailto = counts.mailto += 1 
//     } 

//     if (value.unsub_link != 'not found'){
//       counts.unsub_link = counts.unsub_link += 1 
//     } 
//   })
//   Logger.log(counts)
// }


// function logMailtos(){
  
//   const userProperties = PropertiesService.getUserProperties();

//   const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//   data.forEach(function(value, key){
//     if (value.mailto != 'not found'){
//       Logger.log(value.mailto)
//     }
//   })
// }

// /***
//  * v11: 
//  * grab unsubscribe link and create delete all button for each message when opened 
//  * EDIT: does not work, as "Spam and suspicious messages can’t be used for recommended content or actions. "
//  * 
//   * list of cards: 
//  */

// // deletes all emails from a list of email addresses 
// function delete_emails(userProperties){
//   Logger.log(delete_emails)
//   // // set parameter of search 
//   // const parameter = 'from:'+ sender_address
//   // // Logger.log(parameter)
  
//   // // pull all email threads matching parameter  
//   // const threads = GmailApp.search(parameter);
//   // // Logger.log(threads)

//   // // delete threads
//   // GmailApp.moveThreadsToTrash(threads)

//   // // remove from properties 
//   //   userProperties.deleteProperty(key)
// }

// function toggle_email(e){
//   const userProperties = PropertiesService.getUserProperties();
//   Logger.log(e.parameters.sender)
//   email_data = userProperties.getProperty('sender_data') // grab data row by key 
//   Logger.log(typeof email_data)

//   email_data['delete'] = !email_data['delete'] // flip delete property 
//   Logger.log(email_data)

//   userProperties.setProperty(e.parameters.sender, email_data)  // update properties with new data row 

//   Logger.log(userProperties.getProperty(e.parameters.sender))
// }

// function create_card(key, value){
//   const email = value.email.slice(1, -1)
//   const search = 'https://mail.google.com/mail/u/0/#search/from%3A+' + email
//   Logger.log(value.link)

//   const email_card = CardService.newDecoratedText()
//     .setText('<b>' + '('+ value.count + ') ' + key + '<b>')
//     // .setText('<b>' + '('+ value.count + ') ' + key + '<b>' + '<br>' + value.link)
//     .setTopLabel(email)
//     .setWrapText(true)
//     .setOpenLink(CardService.newOpenLink().setUrl(search))
//     .setSwitchControl(CardService.newSwitch()
//       .setControlType(CardService.SwitchControlType.CHECK_BOX)
//       .setFieldName('delete_checkbox') //setting this to the sender name breaks it for some reason 
//       .setSelected(false) //value.delete
//       .setOnChangeAction(CardService.newAction()
//         .setFunctionName("toggle_email")
//         .setParameters({"email": email, 'sender': key})))
//     // .setButton(CardService.newTextButton()
//     //   .setText('Open ')
//     //   .setOpenLink(CardService.newOpenLink()
//     //     .setUrl(search)))
//   return email_card
// }

// function batchMessages(messageList, sender_data) {

//   //create list of objects containing the requests 
//   var body = messageList.map(function(e){
//     return {
//         method: "GET",
//         endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + e.id
//     }
//   });
//   // Logger.log(body)


//   // build out the rest of the requests for each request in body 
//   var boundary = "xxxxxxxxxx";
//   var contentId = 0;
//   var data = "--" + boundary + "\r\n";
//   for (var i in body) {
//     data += "Content-Type: application/http\r\n";
//     data += "Content-ID: " + ++contentId + "\r\n\r\n";
//     data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
//     data += "--" + boundary + "\r\n";
//   }
//   // Logger.log(data)

//   var payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

//   // boilerplate for request 
//   var options = {
//     method: "post",
//     contentType: "multipart/mixed; boundary=" + boundary,
//     payload: payload,
//     headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
//     muteHttpExceptions: true,
//   };

//   //submit request 
//   var url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
  
//   var res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
//   // Logger.log(res)

//   //split into individual outputs 
//   var dat = res.split("--batch");
//   // Logger.log(dat)

//   // dat.ForEach(function(d){
//   //   Logger.log(d)
//   // })

//   // grab only the output, filtering out the headers 
//   var result = dat.slice(1, dat.length - 1).map(function(e){return e.match(/{[\S\s]+}/g)[0]});
//   // Logger.log(result[0])
//   // Logger.log(JSON.parse(result[0]).payload.headers.find(item => item.name === 'List-Unsubscribe'))
  
//   // record info
//   // Logger.log('batchMessages sender_data')
//   // Logger.log(sender_data)
//   result.map(function(e){
//     const sender_full = JSON.parse(e).payload.headers.find(item => item.name === 'From').value
//     const name = sender_full.replace(/<[^>]*>/g, "").replaceAll('"', '')

//     const unsub_link = JSON.parse(e).payload.headers.find(item => item.name === 'List-Unsubscribe')
//     //null, mailto, link
    
//     if(typeof unsub_link !== 'undefined'){
//       Logger.log(unsub_link.value)
//     }
//     else{
//       Logger.log(unsub_link)
//     }

//     if (sender_data.has(name)){
//       sender_values = sender_data.get(name)
//       sender_data.set(name, {'email': sender_values.email, 'count': sender_values.count+1, 'delete': false, 'link': unsub_link})
//     }
//     else{
//       const email = sender_full.match(/<([^<]*)>/, "");
//       if (email){
//         // Logger.log(typeof email[0])
//         sender_data.set(name, {'email': email[0], 'count':1, 'delete':false, 'link': unsub_link})
//       }
//       else{
//         // Logger.log(typeof name)
//         sender_data.set(name, {'email': name, 'count':1, 'delete':false, 'link': unsub_link})
//       }
//     }
//   })

//   return sender_data
// }

// function email_counts(sender_data, pageToken){
//   // Logger.log('email counts start')
//   // Logger.log(sender_data)
//   // Logger.log(pageToken)

//   // scan 1000 emails in 1 run, 500 at a time 
//   for (let i=0; i<1; i++){
//     // pull message id's 500 at a time 
//     var messageList = Gmail.Users.Messages.list('me', {
//         q: '+unsubscribe',
//         pageToken: pageToken,
//         maxResults: 500,
//         })
//     var messages = messageList.messages
//     // Logger.log(messages)

//     var messages_50 = [] // batch request messages 50 at a time 
//     while (messages.length){
//       // Logger.log(messages.length)
//       // Logger.log(messages.splice(0, 100))
//       messages_50.push(messages.splice(0, 50));
//     }
//     // Logger.log(messages_100.length)
    
//     // send requests for message headers in batches of 50 
//     messages_50.forEach(function(message_block){
//       // Logger.log('messages_50')
//       sender_data = batchMessages(message_block, sender_data)
//     })

//     pageToken = messageList.nextPageToken //reassign page token 
//     // Logger.log(pageToken)
//   }

//   // Logger.log('data in email_counts')
//   // sender_data.forEach(function(value, key){
//   //   Logger.log(value)
//   //   Logger.log(key)
//   // })
//   return [sender_data, pageToken]
// }

// function run_zero(){
//   //get property if hasn't run already
//   const userProperties = PropertiesService.getUserProperties();
//   // Logger.log(userProperties.getProperties())

//   var sender_data;
//   var pageToken;

//   if (userProperties.getProperty('pageToken') != 'start'){
//     // map = new Map(JSON.parse(jsonText));
//     sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//     pageToken = userProperties.getProperty('pageToken')
//   }
//   else{
//     sender_data = new Map()
//     pageToken = null
//   }
//   // Logger.log('run_zero data')
//   // Logger.log(sender_data)
//   // Logger.log(pageToken)

//   var cardHeader = CardService.newCardHeader()
//     .setTitle("Thanks for using Project Zero!")

//   var card = CardService.newCardBuilder()
//     .setHeader(cardHeader)

//   sender_data = email_counts(sender_data, pageToken)
//   // Logger.log('sender_data in run_zero')
//   // Logger.log(sender_data[0])
//   // Logger.log(sender_data[1])
//   const data = sender_data[0]

//   const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count));
//   sorted_data.forEach(function(value, key){
//       const home = CardService.newCardSection()
//         .addWidget(create_card(key, value))
//       card.addSection(home)
//   })
//   const property_data = JSON.stringify(Array.from(sender_data[0].entries()));
//   Logger.log(property_data)
//   let button_text = ''

//   if (sender_data[1]){
//     button_text = 'Scan Next 1000'
//     userProperties.setProperty('pageToken', sender_data[1])
//     userProperties.setProperty('sender_data', property_data);
//   }
//   else{
//     button_text = 'Scan Complete! Run Again?'
//     userProperties.setProperty('pageToken', 'start')
//     userProperties.setProperty('sender_data', property_data);
//   }

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText(button_text)
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero")))
//   card.setFixedFooter(fixedFooter)

//   // set nav
//   var nav = CardService.newNavigation().updateCard(card.build());

//   return CardService.newActionResponseBuilder()
//       .setNavigation(nav)
//       .build();
// }

// function project_zero(){  
//   var card = CardService.newCardBuilder()
//   const userProperties = PropertiesService.getUserProperties();
//   // Logger.log(Object.values(userProperties.getProperties()))

//   if (Object.keys(userProperties.getProperties()).length > 0){
//     if (userProperties.getProperty('pageToken') == 'start'){
//       if (userProperties.getProperty('sender_data') != ''){
//         data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//         const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count));
//         sorted_data.forEach(function(value, key){
//         const home = CardService.newCardSection()
//           .addWidget(create_card(key, value))
//         card.addSection(home)
//         })
//       }
//     }
//   }
//   else{
//     userProperties.setProperty('sender_data', '')
//     userProperties.setProperty('pageToken', 'start')
//   }

//   // // create header 
//   var cardHeader = CardService.newCardHeader()
//     .setTitle("Welcome to Project Zero! Each run scans 1000 emails. Run again if you have more!")
//     // .setImageUrl('https://drive.google.com/uc?export=download&id=1dpP4PxeVabTm3EbqZspreXPMNO17Yk_J')

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setSecondaryButton(CardService.newTextButton().setText("Run Again")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero") ))
//     .setPrimaryButton(CardService.newTextButton().setText("Delete Emails")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("delete_emails") ))
  
//   card.setHeader(cardHeader).build()
//   card.setFixedFooter(fixedFooter).build()

//   return [card.build()]
// }

// function deleteProperties(){
//   const userProperties = PropertiesService.getUserProperties();
//   userProperties.deleteAllProperties()
// }


/***
 * v10: 
 * output cards from largest to smallest 
 */
// // deletes all emails from a specific email address 
// function delete_email(key, userProperties){

//   // set parameter of serach 
//   const parameter = 'from:'+ sender_address
//   // Logger.log(parameter)
  
//   // pull all email threads matching parameter  
//   const threads = GmailApp.search(parameter);
//   // Logger.log(threads)

//   // delete threads
//   GmailApp.moveThreadsToTrash(threads)

//   // remove from properties 
//     userProperties.deleteProperty(key)
// }





// function create_card(key, value){
//   const email = value.email
//   const search = 'https://mail.google.com/mail/u/0/#search/from%3A+' + email
 

//   const email_card = CardService.newDecoratedText()
//     .setText('<b>' + '('+ value.count + ') ' + key + '<b>')
//     .setBottomLabel(value.email.slice(1, -1))
//     .setWrapText(true)
//     .setOpenLink(CardService.newOpenLink().setUrl(search))
//     .setButton(CardService.newTextButton()
//       .setText('Open ')
//       .setOpenLink(CardService.newOpenLink()
//         .setUrl(search)))
//   return email_card
// }

// function batchMessages(messageList, sender_data) {

//   //create list of objects containing the requests 
//   var body = messageList.map(function(e){
//     return {
//         method: "GET",
//         endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + e.id
//     }
//   });
//   // Logger.log(body)


//   // build out the rest of the requests for each request in body 
//   var boundary = "xxxxxxxxxx";
//   var contentId = 0;
//   var data = "--" + boundary + "\r\n";
//   for (var i in body) {
//     data += "Content-Type: application/http\r\n";
//     data += "Content-ID: " + ++contentId + "\r\n\r\n";
//     data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
//     data += "--" + boundary + "\r\n";
//   }
//   // Logger.log(data)

//   var payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

//   // boilerplate for request 
//   var options = {
//     method: "post",
//     contentType: "multipart/mixed; boundary=" + boundary,
//     payload: payload,
//     headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
//     muteHttpExceptions: true,
//   };

//   //submit request 
//   var url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
//   var res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
  
//   //split into individual outputs 
//   var dat = res.split("--batch");
//   // Logger.log(dat)

//   // grab only the output, filtering out the headers 
//   var result = dat.slice(1, dat.length - 1).map(function(e){return e.match(/{[\S\s]+}/g)[0]});
//   // Logger.log(result)
  
//   // record info
//   // Logger.log('batchMessages sender_data')
//   // Logger.log(sender_data)
//   result.map(function(e){
//     const sender_full = JSON.parse(e).payload.headers.find(item => item.name === 'From').value
//     const name = sender_full.replace(/<[^>]*>/g, "").replaceAll('"', '')

//     if (sender_data.has(name)){
//       sender_values = sender_data.get(name)
//       sender_data.set(name, {'email': sender_values.email, 'count': sender_values.count+1})
//     }
//     else{
//       const email = sender_full.match(/<([^<]*)>/, "");
//       if (email){
//         // Logger.log(typeof email[0])
//         sender_data.set(name, {'email': email[0], 'count':1})
//       }
//       else{
//         // Logger.log(typeof name)
//         sender_data.set(name, {'email': name, 'count':1})
//       }
//     }
//   })

//   return sender_data
// }

// function email_counts(sender_data, pageToken){
//   Logger.log('email counts start')
//   Logger.log(sender_data)
//   Logger.log(pageToken)

//   // scan 1000 emails in 1 run, 500 at a time 
//   for (let i=0; i<2; i++){
//     // pull message id's 500 at a time 
//     var messageList = Gmail.Users.Messages.list('me', {
//         q: '+unsubscribe',
//         pageToken: pageToken,
//         maxResults: 500,
//         })
//     var messages = messageList.messages
//     // Logger.log(messages)

//     var messages_50 = [] // batch request messages 50 at a time 
//     while (messages.length){
//       Logger.log(messages.length)
//       // Logger.log(messages.splice(0, 100))
//       messages_50.push(messages.splice(0, 50));
//     }
//     // Logger.log(messages_100.length)
    
//     // send requests for message headers in batches of 50 
//     messages_50.forEach(function(message_block){
//       Logger.log('messages_50')
//       sender_data = batchMessages(message_block, sender_data)
//     })

//     pageToken = messageList.nextPageToken //reassign page token 
//     // Logger.log(pageToken)
//   }

//   // Logger.log('data in email_counts')
//   // sender_data.forEach(function(value, key){
//   //   Logger.log(value)
//   //   Logger.log(key)
//   // })
//   return [sender_data, pageToken]
// }

// function run_zero(){
//   //get property if hasn't run already
//   const userProperties = PropertiesService.getUserProperties();
//   // Logger.log(userProperties.getProperties())

//   var sender_data;
//   var pageToken;

//   if (userProperties.getProperty('pageToken') != 'start'){
//     // map = new Map(JSON.parse(jsonText));
//     sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//     pageToken = userProperties.getProperty('pageToken')
//   }
//   else{
//     sender_data = new Map()
//     pageToken = null
//   }
//   Logger.log('run_zero data')
//   Logger.log(sender_data)
//   Logger.log(pageToken)

//   var cardHeader = CardService.newCardHeader()
//     .setTitle("Thanks for using Project Zero!")

//   var card = CardService.newCardBuilder()
//     .setHeader(cardHeader)

//   sender_data = email_counts(sender_data, pageToken)
//   Logger.log('sender_data in run_zero')
//   Logger.log(sender_data[0])
//   Logger.log(sender_data[1])
//   const data = sender_data[0]

//   const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count));
//   sorted_data.forEach(function(value, key){
//       const home = CardService.newCardSection()
//         .addWidget(create_card(key, value))
//       card.addSection(home)
//   })
//   const property_data = JSON.stringify(Array.from(sender_data[0].entries()));
//   Logger.log(property_data)
//   let button_text = ''

//   if (sender_data[1]){
//     button_text = 'Scan Next 1000'
//     userProperties.setProperty('pageToken', sender_data[1])
//     userProperties.setProperty('sender_data', property_data);
//   }
//   else{
//     button_text = 'Scan Complete! Run Again?'
//     userProperties.setProperty('pageToken', 'start')
//     userProperties.setProperty('sender_data', property_data);
//   }

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText(button_text)
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero")))
//   card.setFixedFooter(fixedFooter)

//   // set nav
//   var nav = CardService.newNavigation().updateCard(card.build());

//   return CardService.newActionResponseBuilder()
//       .setNavigation(nav)
//       .build();
// }

// function project_zero(){  
//   var card = CardService.newCardBuilder()
//   const userProperties = PropertiesService.getUserProperties();
//   Logger.log(Object.values(userProperties.getProperties()))

//   if (Object.keys(userProperties.getProperties()).length > 0){
//     if (userProperties.getProperty('pageToken') == 'start'){
//       if (userProperties.getProperty('sender_data') != ''){
//         data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//         const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count));
//         sorted_data.forEach(function(value, key){
//         const home = CardService.newCardSection()
//           .addWidget(create_card(key, value))
//         card.addSection(home)
//         })
//       }
//     }
//   }
//   else{
//     userProperties.setProperty('sender_data', '')
//     userProperties.setProperty('pageToken', 'start')
//   }

//   // // create header 
//   var cardHeader = CardService.newCardHeader()
//     .setTitle("Welcome to Project Zero! Each run scans 1000 emails. Run again if you have more!")
//     // .setImageUrl('https://drive.google.com/uc?export=download&id=1dpP4PxeVabTm3EbqZspreXPMNO17Yk_J')

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText("Run Project Zero")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero") ))
  
//   card.setHeader(cardHeader).build()
//   card.setFixedFooter(fixedFooter).build()

//   return [card.build()]
// }

// function deleteProperties(){
//   const userProperties = PropertiesService.getUserProperties();
//   userProperties.deleteAllProperties()
// }

/***
 * v9: 
 * save progress, pull old progress when you go back (if completed, rerunning clears everything)
 */
// function create_card(key, value){
//   const email = value.email
//   const search = 'https://mail.google.com/mail/u/1/#search/from%3A+' + email
 

//   const email_card = CardService.newDecoratedText()
//     .setText('<b>' + '('+ value.count + ') ' + key + '<b>')
//     .setBottomLabel(value.email.slice(1, -1))
//     .setWrapText(true)
//     .setButton(CardService.newTextButton()
//       .setText('Open')
//       .setOpenLink(CardService.newOpenLink()
//         .setUrl(search)))
//   return email_card
// }

// function batchMessages(messageList, sender_data) {

//   //create list of objects containing the requests 
//   var body = messageList.map(function(e){
//     return {
//         method: "GET",
//         endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + e.id
//     }
//   });
//   // Logger.log(body)


//   // build out the rest of the requests for each request in body 
//   var boundary = "xxxxxxxxxx";
//   var contentId = 0;
//   var data = "--" + boundary + "\r\n";
//   for (var i in body) {
//     data += "Content-Type: application/http\r\n";
//     data += "Content-ID: " + ++contentId + "\r\n\r\n";
//     data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
//     data += "--" + boundary + "\r\n";
//   }
//   // Logger.log(data)

//   var payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

//   // boilerplate for request 
//   var options = {
//     method: "post",
//     contentType: "multipart/mixed; boundary=" + boundary,
//     payload: payload,
//     headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
//     muteHttpExceptions: true,
//   };

//   //submit request 
//   var url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
//   var res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
  
//   //split into individual outputs 
//   var dat = res.split("--batch");
//   // Logger.log(dat)

//   // grab only the output, filtering out the headers 
//   var result = dat.slice(1, dat.length - 1).map(function(e){return e.match(/{[\S\s]+}/g)[0]});
//   // Logger.log(result)
  
//   // record info
//   // Logger.log('batchMessages sender_data')
//   // Logger.log(sender_data)
//   result.map(function(e){
//     const sender_full = JSON.parse(e).payload.headers.find(item => item.name === 'From').value
//     const name = sender_full.replace(/<[^>]*>/g, "")
    
//     if (sender_data.has(name)){
//       sender_values = sender_data.get(name)
//       sender_data.set(name, {'email': sender_values.email, 'count': sender_values.count+1})
//     }
//     else{
//       const email = sender_full.match(/<([^<]*)>/, "");
//       if (email){
//         // Logger.log(typeof email[0])
//         sender_data.set(name, {'email': email[0], 'count':1})
//       }
//       else{
//         // Logger.log(typeof name)
//         sender_data.set(name, {'email': name, 'count':1})
//       }
//     }
//   })

//   return sender_data
// }

// function email_counts(sender_data, pageToken){
//   // Logger.log('email counts start')
//   // Logger.log(sender_data)
//   // Logger.log(pageToken)

//   // scan 1000 emails in 1 run, 500 at a time 
//   for (let i=0; i<2; i++){

//     // pull message id's 500 at a time 
//     var messageList = Gmail.Users.Messages.list('me', {
//         q: '+unsubscribe',
//         pageToken: pageToken,
//         maxResults: 500,
//         })
//     var messages = messageList.messages
//     // Logger.log(messages)

//     var messages_50 = [] // batch request messages 50 at a time 
//     while (messages.length){
//       // Logger.log(messages.splice(0, 100))
//       messages_50.push(messages.splice(0, 50));
//     }
//     // Logger.log(messages_100.length)
    
//     // send requests for message headers in batches of 50 
//     messages_50.forEach(function(message_block){
//       sender_data = batchMessages(message_block, sender_data)
//     })

//     pageToken = messageList.nextPageToken //reassign page token 
//     // Logger.log(pageToken)
//   }

//   // Logger.log('data in email_counts')
//   // sender_data.forEach(function(value, key){
//   //   Logger.log(value)
//   //   Logger.log(key)
//   // })
//   return [sender_data, pageToken]
// }

// function run_zero(){
//   //get property if hasn't run already
//   const scriptProperties = PropertiesService.getScriptProperties();
//   // Logger.log(scriptProperties.getProperties())

//   var sender_data;
//   var pageToken;

//   if (scriptProperties.getProperty('pageToken') != 'start'){
//     // map = new Map(JSON.parse(jsonText));
//     sender_data = new Map(JSON.parse(scriptProperties.getProperty('sender_data')))
//     pageToken = scriptProperties.getProperty('pageToken')
//   }
//   else{
//     sender_data = new Map()
//     pageToken = null
//   }
//   // Logger.log('run_zero data')
//   // Logger.log(sender_data)
//   // Logger.log(pageToken)

//   var cardHeader = CardService.newCardHeader()
//     .setTitle("Thanks for using Project Zero!")

//   var card = CardService.newCardBuilder()
//     .setHeader(cardHeader)

//   sender_data = email_counts(sender_data, pageToken)
//   // Logger.log('sender_data in run_zero')
//   // Logger.log(sender_data[0])
//   // Logger.log(sender_data[1])

//   sender_data[0].forEach(function(value, key){
//       const home = CardService.newCardSection()
//         .addWidget(create_card(key, value))
//       card.addSection(home)
//   })
//   const property_data = JSON.stringify(Array.from(sender_data[0].entries()));
//   // Logger.log(property_data)
//   let button_text = ''

//   if (sender_data[1]){
//     button_text = 'Scan Next 1000'
//     scriptProperties.setProperty('pageToken', sender_data[1])
//     scriptProperties.setProperty('sender_data', property_data);
//   }
//   else{
//     button_text = 'Scan Complete! Run Again?'
//     scriptProperties.setProperty('pageToken', 'start')
//     scriptProperties.setProperty('sender_data', property_data);
//   }

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText(button_text)
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero")))
//   card.setFixedFooter(fixedFooter)

//   // set nav
//   var nav = CardService.newNavigation().updateCard(card.build());

//   return CardService.newActionResponseBuilder()
//       .setNavigation(nav)
//       .build();
// }

// function project_zero(){  
//   var card = CardService.newCardBuilder()
//   const scriptProperties = PropertiesService.getScriptProperties();
//   // Logger.log(Object.values(scriptProperties.getProperties()))

//   if (Object.keys(scriptProperties.getProperties()).length > 0){
//     if (scriptProperties.getProperty('pageToken') == 'start'){
//       if (scriptProperties.getProperty('sender_data') != ''){
//         data = new Map(JSON.parse(scriptProperties.getProperty('sender_data')))
//         data.forEach(function(value, key){
//         const home = CardService.newCardSection()
//           .addWidget(create_card(key, value))
//         card.addSection(home)
//         })
//       }
//     }
//   }
//   else{
//     scriptProperties.setProperty('sender_data', '')
//     scriptProperties.setProperty('pageToken', 'start')
//   }

//   // // create header 
//   var cardHeader = CardService.newCardHeader()
//     .setTitle("Welcome to Project Zero! Each run scans 1000 emails. Run again if you have more!")
//     // .setImageUrl('https://drive.google.com/uc?export=download&id=1dpP4PxeVabTm3EbqZspreXPMNO17Yk_J')

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText("Run Project Zero")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero") ))
  
//   card.setHeader(cardHeader).build()
//   card.setFixedFooter(fixedFooter).build()

//   return [card.build()]
// }

// function deleteProperties(){
//   const scriptProperties = PropertiesService.getScriptProperties();
//   scriptProperties.deleteAllProperties()
// }


/***
 * v8: implementing properties and runs of 1000 at a time 
 * property contains current sender_data as well as the pageToken 
 */
// function create_card(key, value){
//   const email = value.email
//   const search = 'https://mail.google.com/mail/u/1/#search/from%3A+' + email
 

//   const email_card = CardService.newDecoratedText()
//     .setText('<b>' + '('+ value.count + ') ' + key + '<b>')
//     .setBottomLabel(value.email.slice(1, -1))
//     .setWrapText(true)
//     .setButton(CardService.newTextButton()
//       .setText('Open')
//       .setOpenLink(CardService.newOpenLink()
//         .setUrl(search)))
//   return email_card
// }

// function batchMessages(messageList, sender_data) {

//   //create list of objects containing the requests 
//   var body = messageList.map(function(e){
//     return {
//         method: "GET",
//         endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + e.id
//     }
//   });
//   // Logger.log(body)


//   // build out the rest of the requests for each request in body 
//   var boundary = "xxxxxxxxxx";
//   var contentId = 0;
//   var data = "--" + boundary + "\r\n";
//   for (var i in body) {
//     data += "Content-Type: application/http\r\n";
//     data += "Content-ID: " + ++contentId + "\r\n\r\n";
//     data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
//     data += "--" + boundary + "\r\n";
//   }
//   // Logger.log(data)

//   var payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

//   // boilerplate for request 
//   var options = {
//     method: "post",
//     contentType: "multipart/mixed; boundary=" + boundary,
//     payload: payload,
//     headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
//     muteHttpExceptions: true,
//   };

//   //submit request 
//   var url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
//   var res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
  
//   //split into individual outputs 
//   var dat = res.split("--batch");
//   // Logger.log(dat)

//   // grab only the output, filtering out the headers 
//   var result = dat.slice(1, dat.length - 1).map(function(e){return e.match(/{[\S\s]+}/g)[0]});
//   // Logger.log(result)
  
//   // record info
//   // Logger.log('batchMessages sender_data')
//   // Logger.log(sender_data)
//   result.map(function(e){
//     const sender_full = JSON.parse(e).payload.headers.find(item => item.name === 'From').value
//     const name = sender_full.replace(/<[^>]*>/g, "")
    
//     if (sender_data.has(name)){
//       sender_values = sender_data.get(name)
//       sender_data.set(name, {'email': sender_values.email, 'count': sender_values.count+1})
//     }
//     else{
//       const email = sender_full.match(/<([^<]*)>/, "");
//       if (email){
//         // Logger.log(typeof email[0])
//         sender_data.set(name, {'email': email[0], 'count':1})
//       }
//       else{
//         // Logger.log(typeof name)
//         sender_data.set(name, {'email': name, 'count':1})
//       }
//     }
//   })

//   return sender_data
// }

// function email_counts(sender_data, pageToken){
//   Logger.log('email counts start')
//   Logger.log(sender_data)
//   Logger.log(pageToken)

//   // scan 1000 emails in 1 run, 500 at a time 
//   for (let i=0; i<2; i++){

//     // pull message id's 500 at a time 
//     var messageList = Gmail.Users.Messages.list('me', {
//         q: '+unsubscribe',
//         pageToken: pageToken,
//         maxResults: 500,
//         })
//     var messages = messageList.messages
//     // Logger.log(messages)

//     var messages_50 = [] // batch request messages 50 at a time 
//     while (messages.length){
//       // Logger.log(messages.splice(0, 100))
//       messages_50.push(messages.splice(0, 50));
//     }
//     // Logger.log(messages_100.length)
    
//     // send requests for message headers in batches of 50 
//     messages_50.forEach(function(message_block){
//       sender_data = batchMessages(message_block, sender_data)
//     })

//     pageToken = messageList.nextPageToken //reassign page token 
//     // Logger.log(pageToken)
//   }

//   Logger.log('data in email_counts')
//   sender_data.forEach(function(value, key){
//     Logger.log(value)
//     Logger.log(key)
//   })
//   return [sender_data, pageToken]
// }

// function run_zero(){
//   //get property if hasn't run already
//   const scriptProperties = PropertiesService.getScriptProperties();
//   // Logger.log(scriptProperties.getProperties())

//   var sender_data;
//   var pageToken;

//   if (scriptProperties.getProperty('pageToken') != 'start'){
//     // map = new Map(JSON.parse(jsonText));
//     sender_data = new Map(JSON.parse(scriptProperties.getProperty('sender_data')))
//     pageToken = scriptProperties.getProperty('pageToken')
//   }
//   else{
//     sender_data = new Map()
//     pageToken = null
//   }
//   Logger.log('run_zero data')
//   Logger.log(sender_data)
//   Logger.log(pageToken)

//   var cardHeader = CardService.newCardHeader()
//     .setTitle("Thanks for using Project Zero!")

//   var card = CardService.newCardBuilder()
//     .setHeader(cardHeader)

//   sender_data = email_counts(sender_data, pageToken)
//   Logger.log('sender_data in run_zero')
//   Logger.log(sender_data[0])
//   Logger.log(sender_data[1])

//   sender_data[0].forEach(function(value, key){
//       const home = CardService.newCardSection()
//         .addWidget(create_card(key, value))
//       card.addSection(home)
//   })
//   const property_data = JSON.stringify(Array.from(sender_data[0].entries()));
//   Logger.log(property_data)
//   let button_text = ''

//   if (sender_data[1]){
//     button_text = 'Scan Next 1000'
//     scriptProperties.setProperty('pageToken', sender_data[1])
//     scriptProperties.setProperty('sender_data', property_data);
//   }
//   else{
//     button_text = 'Scan Complete! Run Again?'
//     scriptProperties.setProperty('pageToken', 'start')
//     scriptProperties.setProperty('sender_data', property_data);
//   }

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText(button_text)
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero")))
//   card.setFixedFooter(fixedFooter)

//   // set nav
//   var nav = CardService.newNavigation().updateCard(card.build());

//   return CardService.newActionResponseBuilder()
//       .setNavigation(nav)
//       .build();
// }

// function project_zero(){  
//   var card = CardService.newCardBuilder()
//   const scriptProperties = PropertiesService.getScriptProperties();
//   Logger.log(Object.values(scriptProperties.getProperties()))

//   if (Object.keys(scriptProperties.getProperties()).length > 0){
//     if (scriptProperties.getProperty('pageToken') == 'start'){
//       if (scriptProperties.getProperty('sender_data') != ''){
//         data = new Map(JSON.parse(scriptProperties.getProperty('sender_data')))
//         data.forEach(function(value, key){
//         const home = CardService.newCardSection()
//           .addWidget(create_card(key, value))
//         card.addSection(home)
//         })
//       }
//     }
//   }
//   else{
//     scriptProperties.setProperty('sender_data', '')
//     scriptProperties.setProperty('pageToken', 'start')
//   }

//   // // create header 
//   var cardHeader = CardService.newCardHeader()
//     .setTitle("Welcome to Project Zero! Each run scans 1000 emails. Run again if you have more!")
//     // .setImageUrl('https://drive.google.com/uc?export=download&id=1dpP4PxeVabTm3EbqZspreXPMNO17Yk_J')

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText("Run Project Zero")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero") ))
  
//   card.setHeader(cardHeader).build()
//   card.setFixedFooter(fixedFooter).build()

//   return [card.build()]
// }

// function deleteProperties(){
//   const scriptProperties = PropertiesService.getScriptProperties();
//   scriptProperties.deleteAllProperties()
// }

/***
 * v8: implementing properties and runs of 1000 at a time 
 * property contains current sender_data as well as the pageToken 
 */
// function create_card(key, value){
//   const email = value.email
//   const search = 'https://mail.google.com/mail/u/1/#search/from%3A+' + email
 

//   const email_card = CardService.newDecoratedText()
//     .setText('<b>' + '('+ value.count + ') ' + key + '<b>')
//     .setBottomLabel(value.email.slice(1, -1))
//     .setWrapText(true)
//     .setButton(CardService.newTextButton()
//       .setText('Open')
//       .setOpenLink(CardService.newOpenLink()
//         .setUrl(search)))
//   return email_card
// }

// function batchMessages(messageList, sender_data) {

//   //create list of objects containing the requests 
//   var body = messageList.map(function(e){
//     return {
//         method: "GET",
//         endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + e.id
//     }
//   });
//   // Logger.log(body)


//   // build out the rest of the requests for each request in body 
//   var boundary = "xxxxxxxxxx";
//   var contentId = 0;
//   var data = "--" + boundary + "\r\n";
//   for (var i in body) {
//     data += "Content-Type: application/http\r\n";
//     data += "Content-ID: " + ++contentId + "\r\n\r\n";
//     data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
//     data += "--" + boundary + "\r\n";
//   }
//   // Logger.log(data)

//   var payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

//   // boilerplate for request 
//   var options = {
//     method: "post",
//     contentType: "multipart/mixed; boundary=" + boundary,
//     payload: payload,
//     headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
//     muteHttpExceptions: true,
//   };

//   //submit request 
//   var url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
//   var res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
  
//   //split into individual outputs 
//   var dat = res.split("--batch");
//   // Logger.log(dat)

//   // grab only the output, filtering out the headers 
//   var result = dat.slice(1, dat.length - 1).map(function(e){return e.match(/{[\S\s]+}/g)[0]});
//   // Logger.log(result)
  
//   // record info
//   // Logger.log('batchMessages sender_data')
//   // Logger.log(sender_data)
//   result.map(function(e){
//     const sender_full = JSON.parse(e).payload.headers.find(item => item.name === 'From').value
//     const name = sender_full.replace(/<[^>]*>/g, "")
    
//     if (sender_data.has(name)){
//       sender_values = sender_data.get(name)
//       sender_data.set(name, {'email': sender_values.email, 'count': sender_values.count+1})
//     }
//     else{
//       const email = sender_full.match(/<([^<]*)>/, "");
//       if (email){
//         // Logger.log(typeof email[0])
//         sender_data.set(name, {'email': email[0], 'count':1})
//       }
//       else{
//         // Logger.log(typeof name)
//         sender_data.set(name, {'email': name, 'count':1})
//       }
//     }
//   })

//   return sender_data
// }

// function email_counts(sender_data, pageToken){
//   Logger.log('email counts start')
//   Logger.log(sender_data)
//   Logger.log(pageToken)

//   // scan 1000 emails in 1 run, 500 at a time 
//   for (let i=0; i<2; i++){

//     // pull message id's 500 at a time 
//     var messageList = Gmail.Users.Messages.list('me', {
//         q: '+unsubscribe',
//         pageToken: pageToken,
//         maxResults: 500,
//         })
//     var messages = messageList.messages
//     // Logger.log(messages)

//     var messages_50 = [] // batch request messages 50 at a time 
//     while (messages.length){
//       // Logger.log(messages.splice(0, 100))
//       messages_50.push(messages.splice(0, 50));
//     }
//     // Logger.log(messages_100.length)
    
//     // send requests for message headers in batches of 50 
//     messages_50.forEach(function(message_block){
//       sender_data = batchMessages(message_block, sender_data)
//     })

//     pageToken = messageList.nextPageToken //reassign page token 
//     // Logger.log(pageToken)
//   }

//   Logger.log('data in email_counts')
//   sender_data.forEach(function(value, key){
//     Logger.log(value)
//     Logger.log(key)
//   })
//   return [sender_data, pageToken]
// }

// function run_zero(){
//   //get property if hasn't run already
//   const scriptProperties = PropertiesService.getScriptProperties();
//   // Logger.log(scriptProperties.getProperties())

//   var sender_data;
//   var pageToken;

//   if (Object.keys(scriptProperties.getProperties()).length){
//     // map = new Map(JSON.parse(jsonText));
//     sender_data = new Map(JSON.parse(scriptProperties.getProperty('sender_data')))
//     pageToken = scriptProperties.getProperty('pageToken')
//   }
//   else{
//     sender_data = new Map()
//     pageToken = null
//   }
//   Logger.log('run_zero data')
//   Logger.log(sender_data)
//   Logger.log(pageToken)

//   var cardHeader = CardService.newCardHeader()
//     .setTitle("Welcome to Project Zero! We scan 1000 emails at a time; press run again if you have more.")

//   var card = CardService.newCardBuilder()
//     .setHeader(cardHeader)
//     // .setFixedFooter(fixedFooter)

//   sender_data = email_counts(sender_data, pageToken)
//   Logger.log('sender_data in run_zero')
//   Logger.log(sender_data[0])
//   Logger.log(sender_data[1])

//   sender_data[0].forEach(function(value, key){
//       const home = CardService.newCardSection()
//         .addWidget(create_card(key, value))
//       card.addSection(home)
//   })
//   const property_data = JSON.stringify(Array.from(sender_data[0].entries()));
//   Logger.log(property_data)
//   let button_text = ''

//   if (sender_data[1]){
//     button_text = 'Scan Next 1000'
//     scriptProperties.setProperty('pageToken', sender_data[1])
//     scriptProperties.setProperty('sender_data', property_data);
//   }
//   else{
//     button_text = 'Project Zero Complete!'
//     scriptProperties.deleteAllProperties()
//   }

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText(button_text)
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero")))
//   card.setFixedFooter(fixedFooter)

//   // set nav
//   var nav = CardService.newNavigation().updateCard(card.build());

//   return CardService.newActionResponseBuilder()
//       .setNavigation(nav)
//       .build();
// }

// function project_zero(){  
//   Logger.log('project_zero')

//   // // create header 
//   var cardHeader = CardService.newCardHeader()
//     .setTitle("Welcome to Project Zero! We scan 1000 emails at a time. Run again to scan more!")

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText("Run Project Zero")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero") ))

//   var card = CardService.newCardBuilder()
//     .setHeader(cardHeader)
//     .setFixedFooter(fixedFooter)
  
//   return [card.build()]
// }

// function deleteProperties(){
//   const scriptProperties = PropertiesService.getScriptProperties();
//   scriptProperties.deleteAllProperties()
// }



// /***
//  * v7: building the add-on on top of the logic 
//  */
// function batchMessages(messageList, sender_data) {
//   // var userId = "me"; // Please modify this, if you want to use other userId.

//   //create list of objects containing the requests 
//   var body = messageList.map(function(e){
//     return {
//         method: "GET",
//         endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + e.id
//     }
//   });
//   // Logger.log(body)


//   // build out the rest of the requests for each request in body 
//   var boundary = "xxxxxxxxxx";
//   var contentId = 0;
//   var data = "--" + boundary + "\r\n";
//   for (var i in body) {
//     data += "Content-Type: application/http\r\n";
//     data += "Content-ID: " + ++contentId + "\r\n\r\n";
//     data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
//     data += "--" + boundary + "\r\n";
//   }
//   // Logger.log(data)

//   var payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

//   // boilerplate for request 
//   var options = {
//     method: "post",
//     contentType: "multipart/mixed; boundary=" + boundary,
//     payload: payload,
//     headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
//     muteHttpExceptions: true,
//   };

//   //submit request 
//   var url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
//   var res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
  
//   //split into individual outputs 
//   var dat = res.split("--batch");
//   // Logger.log(dat)

//   // grab only the output, filtering out the headers 
//   var result = dat.slice(1, dat.length - 1).map(function(e){return e.match(/{[\S\s]+}/g)[0]});
//   // Logger.log(result)

//   // record info
//   result.map(function(e){
//     const sender_full = JSON.parse(e).payload.headers.find(item => item.name === 'From').value
//     const name = sender_full.replace(/<[^>]*>/g, "")

//     if (sender_data.has(name)){
//       sender_values = sender_data.get(name)
//       sender_data.set(name, {'email': sender_values.email, 'count': sender_values.count+1})
//     }
//     else{
//       const email = sender_full.match(/<([^<]*)>/, "");
//       if (email){
//         // Logger.log(typeof email[0])
//         sender_data.set(name, {'email': email[0], 'count':1})
//       }
//       else{
//         // Logger.log(typeof name)
//         sender_data.set(name, {'email': name, 'count':1})
//       }
//     }
//   })

//   return sender_data
// }

// function email_counts(sender_data){
//   // 1st run: 
//   var messageList = Gmail.Users.Messages.list('me', {
//         q: '+unsubscribe',
//         pageToken: null,
//         maxResults: 500,
//         })

//   var messages = messageList.messages
//   // Logger.log(messages)

//   var messages_100 = []
    
//   while (messages.length){
//     // Logger.log(messages.splice(0, 100))
//     messages_100.push(messages.splice(0, 100));
//   }
//   // Logger.log(messages_100.length)
  
//   messages_100.forEach(function(message_block){
//     // Logger.log(message_block)
//     sender_data = batchMessages(message_block, sender_data)
//   })

//   var pageToken = messageList.nextPageToken //reassign page token 
//   // Logger.log(pageToken)


//   // // x+1 runs: 
//   while (pageToken){
//     var messageList = Gmail.Users.Messages.list('me', {
//           q: '+unsubscribe',
//           pageToken: pageToken,
//           maxResults: 500,
//           })

//     var messages = messageList.messages
//     // Logger.log(messages)

//     var messages_100 = []
      
//     while (messages.length){
//       // Logger.log(messages.splice(0, 100))
//       messages_100.push(messages.splice(0, 100));
//     }
//     // Logger.log(messages_100.length)
    
//     messages_100.forEach(function(message_block){
//       // Logger.log(message_block)
//       sender_data = batchMessages(message_block, sender_data)
//     })

//     var pageToken = messageList.nextPageToken //reassign page token 
//     // Logger.log(pageToken)
//   }
//   // sender_data.forEach(function(value, key){
//   //   Logger.log(value)
//   //   Logger.log(key)
//   // })
//   return sender_data
// }

// function create_card(key, value){
//   const email = value.email
//   const search = 'https://mail.google.com/mail/u/1/#search/from%3A+' + email
 

//   const email_card = CardService.newDecoratedText()
//     .setText('<b>' + '('+ value.count + ') ' + key + '<b>')
//     .setBottomLabel(value.email.slice(1, -1))
//     .setWrapText(true)
//     .setButton(CardService.newTextButton()
//       .setText('Open')
//       .setOpenLink(CardService.newOpenLink()
//         .setUrl(search)))
//   return email_card
// }

// function run_zero(){
//   var cardHeader = CardService.newCardHeader()
//     .setTitle("Allow 2-3 minutes per 500 emails in inbox.")

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText("Run Project Zero")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero")))

//   var card = CardService.newCardBuilder()
//     .setHeader(cardHeader)
//     .setFixedFooter(fixedFooter)


//   var sender_data = new Map()
//   sender_data = email_counts(sender_data)

//   sender_data.forEach(function(value, key){
//       const home = CardService.newCardSection()
//         .addWidget(create_card(key, value))
//       card.addSection(home)
//   })

//   var nav = CardService.newNavigation().updateCard(card.build());
//       // Navigation.updateCard(card)
//       // cards.push(email_card)

//   return CardService.newActionResponseBuilder()
//       .setNavigation(nav)
//       .build();
// }

// function project_zero(){  
//   // // create header 
//   var cardHeader = CardService.newCardHeader()
//     .setTitle("Testing! email me if any errors occur.")

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText("Run Project Zero")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero")))

//   var card = CardService.newCardBuilder()
//     .setHeader(cardHeader)
//     .setFixedFooter(fixedFooter)
  
//   return [card.build()]
// }

// /***
//  * v6: pulling 500 at a time and then breaking into 100 chunks, instead of 100 -> 100
//  * a couple of seconds faster  
//  */

// function batchMessages(messageList, sender_data) {
//   // var userId = "me"; // Please modify this, if you want to use other userId.

//   //create list of objects containing the requests 
//   var body = messageList.map(function(e){
//     return {
//         method: "GET",
//         endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + e.id
//     }
//   });
//   // Logger.log(body)


//   // build out the rest of the requests for each request in body 
//   const boundary = "xxxxxxxxxx";
//   const contentId = 0;
//   var data = "--" + boundary + "\r\n";
//   for (var i in body) {
//     data += "Content-Type: application/http\r\n";
//     data += "Content-ID: " + ++contentId + "\r\n\r\n";
//     data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
//     data += "--" + boundary + "\r\n";
//   }
//   // Logger.log(data)

//   var payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

//   // boilerplate for request 
//   var options = {
//     method: "post",
//     contentType: "multipart/mixed; boundary=" + boundary,
//     payload: payload,
//     headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
//     muteHttpExceptions: true,
//   };

//   //submit request 
//   var url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
//   var res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
  
//   //split into individual outputs 
//   var dat = res.split("--batch");
//   // Logger.log(dat)

//   // grab only the output, filtering out the headers 
//   var result = dat.slice(1, dat.length - 1).map(function(e){return e.match(/{[\S\s]+}/g)[0]});

//   // record info
//   result.map(function(e){
//     const sender_full = JSON.parse(e).payload.headers.find(item => item.name === 'From').value
//     const name = sender_full.replace(/<[^>]*>/g, "")
//     // Logger.log(name)

//     if (sender_data.has(name)){
//       sender_values = sender_data.get(name)
//       sender_data.set(name, {'email': sender_values.email, 'count': sender_values.count+1})
//     }
//     else{
//       const email = sender_full.match(/<([^<]*)>/, "");
//       sender_data.set(name, {'email': email, 'count':1})
//     }
//   })

//   return sender_data
// }

// function project_zero(){
//   var sender_data = new Map()

//   // 1st run: 
//   var messageList = Gmail.Users.Messages.list('me', {
//         q: '+unsubscribe',
//         pageToken: null,
//         maxResults: 500,
//         })

//   var messages = messageList.messages
//   // Logger.log(messages)

//   var messages_100 = []
    
//   while (messages.length){
//     // Logger.log(messages.splice(0, 100))
//     messages_100.push(messages.splice(0, 100));
//   }
//   // Logger.log(messages_100.length)
  
//   messages_100.forEach(function(message_block){
//     // Logger.log(message_block)
//     sender_data = batchMessages(message_block, sender_data)
//   })

//   var pageToken = messageList.nextPageToken //reassign page token 
//   Logger.log(pageToken)


//   // // x+1 runs: 
//   while (pageToken){
//     var messageList = Gmail.Users.Messages.list('me', {
//           q: '+unsubscribe',
//           pageToken: pageToken,
//           maxResults: 500,
//           })

//     var messages = messageList.messages
//     // Logger.log(messages)

//     var messages_100 = []
      
//     while (messages.length){
//       // Logger.log(messages.splice(0, 100))
//       messages_100.push(messages.splice(0, 100));
//     }
//     // Logger.log(messages_100.length)
    
//     messages_100.forEach(function(message_block){
//       // Logger.log(message_block)
//       sender_data = batchMessages(message_block, sender_data)
//     })

//     var pageToken = messageList.nextPageToken //reassign page token 
//     Logger.log(pageToken)
//   }
//   // sender_data.forEach(function(value, key){
//   //   Logger.log(value)
//   //   Logger.log(key)
//   // })
//   return sender_data
// }

// /***
//  * v5: Gmail API instead of GmailApp
//  */

// function batchMessages(messageList, sender_data) {
//   // var userId = "me"; // Please modify this, if you want to use other userId.

//   //create list of objects containing the requests 
//   var body = messageList.map(function(e){
//     return {
//         method: "GET",
//         endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + e.id
//     }
//   });
//   // Logger.log(body)


//   // build out the rest of the requests for each request in body 
//   var boundary = "xxxxxxxxxx";
//   var contentId = 0;
//   var data = "--" + boundary + "\r\n";
//   for (var i in body) {
//     data += "Content-Type: application/http\r\n";
//     data += "Content-ID: " + ++contentId + "\r\n\r\n";
//     data += body[i].method + " " + body[i].endpoint + "\r\n\r\n";
//     data += "--" + boundary + "\r\n";
//   }
//   // Logger.log(data)

//   var payload = Utilities.newBlob(data).getBytes(); //encode data into bytes 

//   // boilerplate for request 
//   var options = {
//     method: "post",
//     contentType: "multipart/mixed; boundary=" + boundary,
//     payload: payload,
//     headers: {'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()},
//     muteHttpExceptions: true,
//   };

//   //submit request 
//   var url = "https://www.googleapis.com//batch/gmail/v1"; // request url 
//   var res = UrlFetchApp.fetch(url, options).getContentText(); // send request and getContentText 
  
//   //split into individual outputs 
//   var dat = res.split("--batch");
//   // Logger.log(dat)

//   // grab only the output, filtering out the headers 
//   var result = dat.slice(1, dat.length - 1).map(function(e){return e.match(/{[\S\s]+}/g)[0]});

//   // record info
//   result.map(function(e){
//     const sender_full = JSON.parse(e).payload.headers.find(item => item.name === 'From').value
//     const name = sender_full.replace(/<[^>]*>/g, "")
//     // Logger.log(name)

//     if (sender_data.has(name)){
//       sender_values = sender_data.get(name)
//       sender_data.set(name, {'email': sender_values.email, 'count': sender_values.count+1})
//     }
//     else{
//       const email = sender_full.match(/<([^<]*)>/, "");
//       sender_data.set(name, {'email': email, 'count':1})
//     }
//   })

//   // sender_data.forEach(function(value, key){
//   //   Logger.log(value)
//   //   Logger.log(key)
//   // })
//   return sender_data
// }

// function project_zero(){

//   var sender_data = new Map()

//   // 1st run: 
//   var messageList = Gmail.Users.Messages.list('me', {
//         q: '+unsubscribe',
//         pageToken: null,
//         maxResults: 100,
//         })
//   var messages = messageList.messages
//   sender_data = batchMessages(messages, sender_data)
//   var pageToken = messageList.nextPageToken //reassign page token 
//   Logger.log(pageToken)

//   // x+1 runs: 
//   while (pageToken){

//     // pull 100 messages
//     messageList = Gmail.Users.Messages.list('me', {
//       q: '+unsubscribe',
//       pageToken: pageToken,
//       maxResults: 100,
//       })

//     messages = messageList.messages //pull messages out of list 
//     sender_data = batchMessages(messages, sender_data) // grab data 
//     pageToken = messageList.nextPageToken //update token 
//     Logger.log(pageToken)
//   }
//   sender_data.forEach(function(value, key){
//     Logger.log(value)
//     Logger.log(key)
//   })
// }

// /***
//    * can make more efficient by batching Messages.get
//    * EDIT: Also you can use fields parameter in query to request the fields you want from the messages, 
//    * since both messages.list and messages.get can return a whole users.messages Resource.
//    * Unfortunately, you'll run into other issues like execution time quotas. There's no way to process all 22000 messages in a single call without exceeding the quota. You must monitor execution time and stop the script when the script runtime gets close to the one set by the quota (6 minutes runtime for personal accounts) and re-schedule the script to run again using ScriptApp.newTrigger(functionName). You must also store the value of 'startIndex' between calls - consider using PropertiesService.
//    */
// function project_zero(){
//   // 1st run: 

//   const messageList = Gmail.Users.Messages.list('me', {
//         q: '+unsubscribe',
//         pageToken: null,
//         maxResults: 500,
//         });
//   // Logger.log(messageList)

//   const message_ids = messageList.messages.map(function(e){return e.id});
//   // Logger.log(message_ids)

//   const senders = message_ids.map(function(e){
//     return Gmail.Users.Messages.get('me', e, {format: 'metadata'}).payload.headers.find(item => item.name === 'From').value;
//   })

//   var sender_data = new Map()

//   senders.forEach(function(sender, key){
//     const name = sender.replace(/<[^>]*>/g, "")
//     // Logger.log(name)

//     if (sender_data.has(name)){
//       sender_values = sender_data.get(name)
//       sender_data.set(name, {'email': sender_values.email, 'count': sender_values.count+1})
//     }
//     else{
//       const email = sender.match(/<([^<]*)>/, "");
//       sender_data.set(name, {'email': email, 'count':1})
//     }
//   })
//   // sender_data.forEach(function(value, key){
//   //   Logger.log(value)
//   //   Logger.log(key)
//   // })
//   Logger.log('run 1')
//   pageToken = messageList.nextPageToken
//   // rest of runs: end of iteration when nextPageToken = 0
//   while (pageToken){
//     const messageList = Gmail.Users.Messages.list('me', {
//         q: '+unsubscribe',
//         pageToken: pageToken,
//         maxResults: 500,
//         });
//   // Logger.log(messageList)

//     const message_ids = messageList.messages.map(function(e){return e.id});
//     // Logger.log(message_ids)

//     const senders = message_ids.map(function(e){
//       return Gmail.Users.Messages.get('me', e, {format: 'metadata'}).payload.headers.find(item => item.name === 'From').value;
//     })

//     senders.forEach(function(sender, key){
//       const name = sender.replace(/<[^>]*>/g, "")
//       // Logger.log(name)

//       if (sender_data.has(name)){
//         sender_values = sender_data.get(name)
//         sender_data.set(name, {'email': sender_values.email, 'count': sender_values.count+1})
//       }
//       else{
//         const email = sender.match(/<([^<]*)>/, "");
//         sender_data.set(name, {'email': email, 'count':1})
//       }
//     })
//   Logger.log(pageToken)
//   pageToken = messageList.nextPageToken
  
//   }
//   sender_data.forEach(function(value, key){
//   Logger.log(value)
//   Logger.log(key)
//   })

  
//   // Logger.log(threadList)
// }


/***
 * v4: 
 * default welcome, button to run 
 * overcome 90 second limit:
  * Navigation
 */

// // check_subscribed()
// // param: message object 
// //return: unsubscribe link if message has subscribe in it, or false 
// function check_subscribed(email_message){
//   // Logger.log(email_message)
//   // pull out text 
//   body_text = email_message.getPlainBody().toLowerCase()
//   // Logger.log(body_text);

//   // strategy: find "unsubscribe", find http after unsubscribe 
//   var unsub_index = body_text.indexOf("unsubscribe") // find index of unsubscribe; lastIndexOf maybe?

//   // find unsubscribe link if "subscribe" was found
//   if (unsub_index != -1){
//     var unsub_body = body_text.substring(unsub_index) // subset from unsubscribe text 
//     // Logger.log(unsub_body)

//     var regExp = new RegExp("http.*\s") // find string that starts with http, ends with space 
    
//     // need to put in something if link is not found 
//     var unsub_link = regExp.exec(unsub_body)
//     if (unsub_link != null){
//       return unsub_link[0]
//     }

//   } 
//   return false // if no "subscribe" was found
// }

// //returns email sender as key, number of emails and unsub link as values 
// function unsub_counts() {
//   const search_slug = 'https://mail.google.com/mail/u/0/#search/from%3A+'

//   // set up hash table for unsubscribe links 
//   var sender_links = new Map()

//   // get all messages in inbox 
//   var start = 0
//   var num_messages = 500

//   while (num_messages >0){
//     // pull 500 messages
//     var thread_block = GmailApp.getInboxThreads(start, 500)
//     // Logger.log('thread_block')
//     var messages_block = GmailApp.getMessagesForThreads(thread_block)
//     // Logger.log('messages_block')

//     //iterate through each message 
//     messages_block.forEach(function (message_list, index){
//       var message = message_list[0]
//       // Logger.log(message)

//       // check if unsub
//       var unsub_link = check_subscribed(message)

//       if (unsub_link){
//         var sender = message.getFrom()
//         // // Logger.log(sender_name)

//         if (sender_links.has(sender)){
//             var sender_data = sender_links.get(sender) 
//             sender_data.count = sender_data.count + 1
//             sender_links.set(sender, sender_data)
//             // Logger.log(sender_data)
//         }
//         else{
//           // grab sender name, email, and search
//           const name = sender.replace(/<[^>]*>/g, "")
//           var email = sender.match(/<([^<]*)>/, "");
          
//           if (email){
//             email = email[0]
//             var search = search_slug + email.replace(/@/g, "%40")
//           }
//           else{
//             var search = search_slug + name.replace(/@/g, "%40")
//           }
//           // Logger.log(name)
//           // Logger.log(email)


//           // add unsub link to hash table
//           sender_links.set(sender, {'count': 1, 
//                                     'unsub_link': unsub_link, 
//                                     'name': name, 
//                                     'email': email, 
//                                     'search': search}) 
//         }
//         // Logger.log(sender_links)
//         }
//       })

//     // num_messages = messages_block.length
//     num_messages = 0
//     start = start + 500

//     // Logger.log(num_messages)
//   }

//   // sender_links.forEach(function(value, key){
//   //   Logger.log(key)
//   //   Logger.log(value)
//   // })
  
//   return sender_links
// }

// function del(){
//   Logger.log('delete button clicked!')
// }

// function create_card(key, value){
//   // const search_slug = 'https://mail.google.com/mail/u/0/#search/from%3A+'

//   // card text 
//   // var card_text = '<b>' + key + '<b>' + '<br>' + '<a href=' + value + '>unsubscribe</a>'
//   // var card_text = value + '<br>' + '<a href=' + value + '>unsubscribe</a>'
//   // Logger.log(card_text)
//   Logger.log(value.search)

//   const email_card = CardService.newDecoratedText()
//     .setText('<b>' + '('+ value.count + ') ' + value.name + '<b>')
//     // .setBottomLabel(value.email)
//     .setWrapText(true)
//     .setButton(CardService.newTextButton()
//       .setText('Open')
//       .setOpenLink(CardService.newOpenLink()
//         .setUrl(value.search)))
//       // .setOnClickOpenLinkAction(CardService.newAction()
//       //   .setFunctionName('openLinkCallback')
//       //   .setParameters({'search': value.search})))
    
//   return email_card

// }
// function run_zero(){
//   const database = unsub_counts() // return sender data

//   var cardHeader = CardService.newCardHeader()
//     .setTitle("Allow 2-3 minutes per 500 emails in inbox.")

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText("Run Project Zero")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero")))

//   var card = CardService.newCardBuilder()
//     .setHeader(cardHeader)
//     .setFixedFooter(fixedFooter)

//   // cards = []
//   database.forEach(function(value, key){
//     // const label = GmailApp.getUserLabelByName(key) // grab the label using its name 
//     Logger.log(value.search)
//     // const email_card = create_card(key, value)
    
//       const home = CardService.newCardSection()
//         .addWidget(create_card(key, value))

//       card.addSection(home)
//   })

//   var nav = CardService.newNavigation().updateCard(card.build());
//       // Navigation.updateCard(card)
//       // cards.push(email_card)

//   return CardService.newActionResponseBuilder()
//       .setNavigation(nav)
//       .build();
//   // Logger.log(cards)
//   // single_card = cards[0]
//   // return [single_card.build()]

// }
// function project_zero(){  
//   // // create header 
//   var cardHeader = CardService.newCardHeader()
//     .setTitle("Allow 2-3 minutes per 500 emails in inbox.")

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText("Run Project Zero")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("run_zero")))

//   var card = CardService.newCardBuilder()
//     .setHeader(cardHeader)
//     .setFixedFooter(fixedFooter)
  
//   return [card.build()]

// }
// Logger.log(database)
//   var database = new Map()
//   database.set('Google','google.com/unsubscribe')
//   database.set('Amazon','amazon.com/unsubscribe')
//   database.set('Vanderbilt','vanderbilt.edu/unsubscribe')
//   database.set('sender', {'count': 1, 'unsub_link': 'unsub_link', 'name': 'name', 'email': 'email', 'search': 'https://mail.google.com/mail/u/1/#search/from%3A+bella.forristal%4080000hours.org'}) 
//   database.set('sender2', {'count': 1, 'unsub_link': 'unsub_link', 'name': 'name', 'email': 'email'}) 
//   database.set('sender3', {'count': 1, 'unsub_link': 'unsub_link', 'name': 'name', 'email': 'email'}) 


// /***
//  * v3: 
//  * normal search function 
//  * getMessagesforThreads instead of getMessagesforThread
//  * no labels
//  * add-on: sender, email, count, redirect
//  */

// // check_subscribed()
// // param: message object 
// //return: unsubscribe link if message has subscribe in it, or false 
// function check_subscribed(email_message){
//   // Logger.log(email_message)
//   // pull out text 
//   body_text = email_message.getPlainBody().toLowerCase()
//   // Logger.log(body_text);

//   // strategy: find "unsubscribe", find http after unsubscribe 
//   var unsub_index = body_text.indexOf("unsubscribe") // find index of unsubscribe; lastIndexOf maybe?

//   // find unsubscribe link if "subscribe" was found
//   if (unsub_index != -1){
//     var unsub_body = body_text.substring(unsub_index) // subset from unsubscribe text 
//     // Logger.log(unsub_body)

//     var regExp = new RegExp("http.*\s") // find string that starts with http, ends with space 
    
//     // need to put in something if link is not found 
//     var unsub_link = regExp.exec(unsub_body)
//     if (unsub_link != null){
//       return unsub_link[0]
//     }

//   } 
//   return false // if no "subscribe" was found
// }

// //returns email sender as key, number of emails and unsub link as values 
// function unsub_counts() {
//   const search_slug = 'https://mail.google.com/mail/u/0/#search/from%3A+'

//   // set up hash table for unsubscribe links 
//   var sender_links = new Map()

//   // get all messages in inbox 
//   var start = 0
//   var num_messages = 500

//   while (num_messages >0){
//     // pull 500 messages
//     var thread_block = GmailApp.getInboxThreads(start, 500)
//     // Logger.log('thread_block')
//     var messages_block = GmailApp.getMessagesForThreads(thread_block)
//     // Logger.log('messages_block')

//     //iterate through each message 
//     messages_block.forEach(function (message_list, index){
//       var message = message_list[0]
//       // Logger.log(message)

//       // check if unsub
//       var unsub_link = check_subscribed(message)

//       if (unsub_link){
//         var sender = message.getFrom()
//         // // Logger.log(sender_name)

//         if (sender_links.has(sender)){
//             var sender_data = sender_links.get(sender) 
//             sender_data.count = sender_data.count + 1
//             sender_links.set(sender, sender_data)
//             // Logger.log(sender_data)
//         }
//         else{
//           // grab sender name, email, and search
//           const name = sender.replace(/<[^>]*>/g, "")
//           var email = sender.match(/<([^<]*)>/, "");
          
//           if (email){
//             email = email[0]
//             var search = search_slug + email.replace(/@/g, "%40")
//           }
//           else{
//             var search = search_slug + name.replace(/@/g, "%40")
//           }
//           // Logger.log(name)
//           // Logger.log(email)


//           // add unsub link to hash table
//           sender_links.set(sender, {'count': 1, 
//                                     'unsub_link': unsub_link, 
//                                     'name': name, 
//                                     'email': email, 
//                                     'search': search}) 
//         }
//         // Logger.log(sender_links)
//         }
//       })

//     // num_messages = messages_block.length
//     num_messages = 0
//     start = start + 500

//     // Logger.log(num_messages)
//   }

//   // sender_links.forEach(function(value, key){
//   //   Logger.log(key)
//   //   Logger.log(value)
//   // })
  
//   return sender_links
// }
// // **delete_email(email address)**
// //deletes all emails from a specific email address 
// function delete_email(sender_address){

//   // set parameter of serach 
//   var parameter = 'from:'+ sender_address
//   // Logger.log(parameter)
  
//   // pull all email threads matching parameter  
//   var threads = GmailApp.search(parameter);
//   // Logger.log(threads)

//   // delete threads
//   GmailApp.moveThreadsToTrash(threads)
// }

// function del(){
//   Logger.log('delete button clicked!')
// }
// function check(){
//   Logger.log('checkbox clicked!')
// }

// function openLinkCallback(event) {
//   Logger.log(event)
//   return CardService.newActionResponseBuilder()
//       .setOpenLink(CardService.newOpenLink()
//           .setUrl('https://mail.google.com/mail/u/1/#search/from%3A+%3Crecommended-pads%40alerts.hotpads.com%3E'))
//       .build();
//   } 

// function create_card(key, value){
//   // const search_slug = 'https://mail.google.com/mail/u/0/#search/from%3A+'

//   // card text 
//   // var card_text = '<b>' + key + '<b>' + '<br>' + '<a href=' + value + '>unsubscribe</a>'
//   // var card_text = value + '<br>' + '<a href=' + value + '>unsubscribe</a>'
//   // Logger.log(card_text)
//   Logger.log(value.search)

//   var email_card = CardService.newDecoratedText()
//     .setText('<b>' + '('+ value.count + ') ' + value.name + '<b>')
//     .setBottomLabel(value.email)
//     .setWrapText(true)
//     .setButton(CardService.newTextButton()
//       .setText('Open')
//       .setOpenLink(CardService.newOpenLink()
//         .setUrl(value.search)))
//       // .setOnClickOpenLinkAction(CardService.newAction()
//       //   .setFunctionName('openLinkCallback')
//       //   .setParameters({'search': value.search})))
    
//   return email_card

// }
// /***
//  * need to add in a trailing case to handle the overflow after last 500 
//  */

// function project_zero(){  
//   // const database = unsub_counts() // return sender data
//   // Logger.log(database)
//   var database = new Map()
//   // database.set('Google','google.com/unsubscribe')
//   // database.set('Amazon','amazon.com/unsubscribe')
//   // database.set('Vanderbilt','vanderbilt.edu/unsubscribe')
//   // database.set('sender', {'count': 1, 'unsub_link': 'unsub_link', 'name': 'name', 'email': 'email', 'search': 'https://mail.google.com/mail/u/1/#search/from%3A+bella.forristal%4080000hours.org'}) 
//   // database.set('sender2', {'count': 1, 'unsub_link': 'unsub_link', 'name': 'name', 'email': 'email'}) 
//   // database.set('sender3', {'count': 1, 'unsub_link': 'unsub_link', 'name': 'name', 'email': 'email'}) 
  



//   // create header 
//   var cardHeader = CardService.newCardHeader()
//     .setTitle("Allow 2-3 minutes per 500 emails in inbox.")

//   // create footer 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText("Run Project Zero")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("del")))

//   var card = CardService.newCardBuilder()
//     .setHeader(cardHeader)
//     .setFixedFooter(fixedFooter)
  
//   cards = []
//   database.forEach(function(value, key){
//     // const label = GmailApp.getUserLabelByName(key) // grab the label using its name 
//     Logger.log(value.search)
//     const email_card = create_card(key, value)
    
//     var home = CardService.newCardSection()
//       .addWidget(email_card)

//     card.addSection(home)
//     // cards.push(email_card)
  
//   })
//   // Logger.log(cards)
//   // single_card = cards[0]
//   // return [single_card.build()]

//   return [card.build()]

// }


// /***
//  * changes in v2: 
//  * 1. move function inside of 500 loop
//  * 2. labels 
//  */

// // check_subscribed()
// // param: message object 
// //return: unsubscribe link if message has subscribe in it, or -1 

// /***
//  * potential step 1: first filter by searching for "unsubscribe"? 
//  */
// function check_subscribed(email_message){
//   // Logger.log(email_message)
//   // pull out text 
//   body_text = email_message.getPlainBody().toLowerCase()
//   // Logger.log(body_text);

//   // strategy: find "unsubscribe", find http after unsubscribe 
//   var unsub_index = body_text.indexOf("unsubscribe") // find index of unsubscribe; lastIndexOf maybe?

//   // find unsubscribe link if "subscribe" was found
//   if (unsub_index != -1){
//     var unsub_body = body_text.substring(unsub_index) // subset from unsubscribe text 
//     // Logger.log(unsub_body)

//     var regExp = new RegExp("http.*\s") // find string that starts with http, ends with space 
    
//     // need to put in something if link is not found 
//     var unsub_link = regExp.exec(unsub_body)
//     if (unsub_link != null){
//       return unsub_link[0]
//     }

//   } 
//   return false // if no "subscribe" was found
// }

// //returns email sender as key, number of emails and unsub link as values 
// function unsub_counts() {

//   var labels = GmailApp.getUserLabels()
//   var pzero_label = GmailApp.createLabel("Project Zero")

//   // set up hash table for unsubscribe links 
//   var sender_links = new Map()

//   // get all messages in inbox 
//   var start = 0
//   var num_messages = 1

//   while (num_messages > 0){
//     Logger.log(start)
//     // pull 500 messages

//     var message_block = GmailApp.search('subscribe', start, 500);
//     num_messages = message_block.length
//     Logger.log(num_messages)
//     // var message_block = GmailApp.getInboxThreads(start, 500)

//     //iterate through each message 
//     message_block.forEach(function (thread, index){
//       var message = GmailApp.getMessagesForThread(thread)[0]
      

//       // check if unsub
//       var unsub_link = check_subscribed(message)

//       if (unsub_link){
//         // grab sender name 
//         var sender = message.getFrom()
//         // var sender_name = sender.replace(/<[^>]*>/g, "")
//         // // Logger.log(sender_name)

//         potential_label = 'Project Zero/'+sender
//         if (labels.includes(potential_label)){
//           var label = GmailApp.getUserLabelByName(potential_label)
//         }
//         else {
//           // create a new label with the sender as the name 
//           var label = GmailApp.createLabel(potential_label)

//           // add unsub link to hash table 
//           sender_links.set(sender, unsub_link) 
//           // Logger.log(sender_links)
//           // add label to current labels 
//           labels.push(label)
//         }

//         // add new label or old label to the current thread
//         label.addToThread(thread)
//         // Logger.log(label.getName())
//       }
//     })
//     num_messages = message_block.length  
//     start = start + 500
//     Logger.log(start)

//     // Logger.log(num_messages)
//   }

  

//   // sender_links.forEach(function(value, key){
//   //   Logger.log(key)
//   //   Logger.log(value)
//   // })
  
//   return sender_links
// }
  
// // **delete_email(email address)**
// //deletes all emails from a specific email address 
// function delete_email(sender_address){

//   // set parameter of serach 
//   var parameter = 'from:'+ sender_address
//   // Logger.log(parameter)
  
//   // pull all email threads matching parameter  
//   var threads = GmailApp.search(parameter);
//   // Logger.log(threads)

//   // delete threads
//   GmailApp.moveThreadsToTrash(threads)
// }

// function del(){
//   Logger.log('delete button clicked!')
// }
// function check(){
//   Logger.log('checkbox clicked!')
// }

// function create_card(key, value){

//   // card text 
//   // var card_text = '<b>' + key + '<b>' + '<br>' + '<a href=' + value + '>unsubscribe</a>'
//   var card_text = value + '<br>' + '<a href=' + value + '>unsubscribe</a>'
//   // Logger.log(card_text)
  
//   var email_card = CardService.newDecoratedText()
//     .setText(card_text)
//     .setWrapText(true)
    
//   return email_card

// }
// /***
//  * need to add in a trailing case to handle the overflow after last 500 
//  */

// function project_zero(){  
//   const database = unsub_counts() // creates labels, returns sender/unsub_link pairs
//   // var database = new Map()
//   // database.set('Google','google.com/unsubscribe')
//   // database.set('Amazon','amazon.com/unsubscribe')
//   // database.set('Vanderbilt','vanderbilt.edu/unsubscribe')

//   // create add-on 
//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText("Run Project Zero")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("del")))

//   var card = CardService.newCardBuilder()
//     .setFixedFooter(fixedFooter)



//   cards = []
//   database.forEach(function(value, key){
//     const label = GmailApp.getUserLabelByName(key) // grab the label using its name 
    
//     const email_card = create_card(key, value)

//     var home = CardService.newCardSection()
//       .addWidget(email_card)

//     card.addSection(home)
//     // cards.push(email_card)
  
//   })
//   Logger.log(cards)
//   single_card = cards[0]
//   // return [single_card.build()]

//   return [card.build()]

// }







// function create_card(key, value){
//   // card containing email sender, number of emails, and select button for deletion 
//   // var button = CardService.newTextButton().setText('')
//   //   .setOnClickAction(CardService.newAction().setFunctionName('del'))
//   Logger.log(key)

//   // card text 
//   var card_text = '<b>' + key + '<b>' + '<br>' + '<a href=' + value + '>unsubscribe</a>'
//   Logger.log(card_text)
//   var email_card = CardService.newDecoratedText()
//     .setText(card_text)
//     .setWrapText(true)
//     .setButton(CardService.newTextButton()
//       .setText('yay')
//       .setOnClickAction(CardService.newAction().setFunctionName('del')));

//   var home = CardService.newCardSection()
//   .addWidget(email_card)
//     .addWidget(CardService.newDivider())

//   var fixedFooter = CardService.newFixedFooter()
//     .setPrimaryButton(CardService.newTextButton().setText("Run Project Zero")
//       .setOnClickAction(CardService.newAction()
//         .setFunctionName("del")))

//   var card = CardService.newCardBuilder()
//     // .setHeader('Subscribed Emails')
//     .addSection(home)
//     .setFixedFooter(fixedFooter)
    
//   return card

// }


  
