/***
 * v20: 
 */

function update_zero(zero_data, pageToken){

  const userProperties = PropertiesService.getUserProperties(); // call in data 

  // scan 500 emails in 1 run, 500 at a time 
  for (let i=0; i<1; i++){
    // pull message id's 500 at a time 
    var messageList = Gmail.Users.Messages.list('me', {
        q: '+unsubscribe',
        pageToken: pageToken,
        maxResults: 500,
      })

    //pull out message objects 
    var messages = messageList.messages
    // Logger.log(messages)

    var messages_50 = [] // batch request messages 50 at a time 
    while (messages.length){
      messages_50.push(messages.splice(0, 50));
    }
    // Logger.log(messages_50.length)
    
    // send requests for message headers in batches of 50 
    messages_50.forEach(function(message_block){
      // Logger.log('batch')
      const message_headers = batchedHeaders(message_block, zero_data)
      // Logger.log(message_headers)

      zero_data = update_data(message_headers, zero_data)
      // Logger.log(zero_data)
    })
    pageToken = messageList.nextPageToken //reassign page token 
  }
  const updated_data = JSON.stringify(Array.from(zero_data.entries()));
  // const userProperties = PropertiesService.getUserProperties();
  userProperties.setProperty('sender_data', updated_data)
  return [zero_data, pageToken]
}

function batchedHeaders(messageList){
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

  // grab only the output, filtering out the headers 
  var message_headers = dat.slice(1, dat.length - 1).map(function(e){return e.match(/{[\S\s]+}/g)[0]});

  return message_headers
}

function update_data(headers, zero_data){
  // isolates List-Unsubscribe header data from each message 
  headers.map(function(e){

    const sender_full = JSON.parse(e).payload.headers.find(item => item.name === 'From').value
    var email = sender_full.match(/<([^<]*)>/, "");
    if (email){
      email = email[1]
    }
    else{
      email = sender_full
    }

    var name = sender_full.replace(/<[^>]*>/g, "").replaceAll('"', '')
    if (name == null){
      name = email
    }
    // Logger.log(name)

    var unsub_link = 'not found'
    var mailto = 'not found'
    var unsub_array = JSON.parse(e).payload.headers.find(item => item.name === 'List-Unsubscribe')
    if (unsub_array){
      const unsub_match = unsub_array.value.match(/https?:\/\/(.+?)(\s|,)/);
      if (unsub_match) {
        unsub_link = unsub_match[0];
        // Logger.log(unsub_link)
      }
      var mailto_match = unsub_array.value.match(/mailto:(.+?)(\s|,|>)/);
      if (mailto_match) {
        mailto = mailto_match[1];
      }
    }
    const old_data = zero_data.get(email)
    var current_senders = {name: 1}
    if (old_data){
      var current_senders = old_data.senders
      if (name in current_senders){
        current_senders[name] = current_senders[name] + 1 
      }
      else{
        current_senders[name] = 1;
      }
      zero_data.set(email, 
      {'count':old_data.count + 1, 'link': old_data.link, 'mailto': old_data.mailto, 'senders': current_senders })
    }

    else{
      zero_data.set(email, {'count':1, 'link': unsub_link, 'mailto': mailto, 'senders': {[name]: 1} })
    }
  })
  return zero_data
}

function run_zero(){
  // create new card
  var card = CardService.newCardBuilder()
  card.addSection(create_searchbar('')) // add search bar to card 

  var sender_data;
  var pageToken;

  //get property if hasn't run already
  const userProperties = PropertiesService.getUserProperties();

  if (userProperties.getKeys().length ==3){
    sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
    pageToken = userProperties.getProperty('pageToken')
  }
  else if (userProperties.getKeys().length ==2){
    // Logger.log('rerunning!')
    userProperties.setProperty('pageToken', '')
    sender_data = new Map()
    userProperties.setProperty('sender_data', '')
  }
  else{
    sender_data = new Map()
    pageToken = null

    userProperties.setProperty('autodeletes', '{}')
    userProperties.setProperty('sender_data', '')
  }

  sender_data = update_zero(sender_data, pageToken)

  const data = sender_data[0]
  const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count));

  sorted_data.forEach(function(value, key){
    // Logger.log(value)
    // Logger.log(value.link)
      const home = CardService.newCardSection()
        .addWidget(create_card(key, value))
        .addWidget(create_cardbuttons(value.link, key, value.mailto))
      card.addSection(home)
  })

  const property_data = JSON.stringify(Array.from(sender_data[0].entries()));
  let button_text = ''
  if (sender_data[1]){
    // Logger.log('scan next 5')
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
    .setSecondaryButton(CardService.newTextButton().setText('autodeletes')
      .setOnClickAction(CardService.newAction()
        .setFunctionName("all_autodeletes")))
  card.setFixedFooter(fixedFooter)

  // set nav
  var nav = CardService.newNavigation().updateCard(card.build());

  // create p_0 label if one does not exist 
  const p0_id = check_p0_label()

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
        .addWidget(create_cardbuttons(value.link, key, value.mailto))
      card.addSection(home)
    })
  }

  // create footer 
  var fixedFooter = CardService.newFixedFooter()
    .setPrimaryButton(CardService.newTextButton().setText("Run Zero")
      .setOnClickAction(CardService.newAction()
        .setFunctionName("run_zero")))
    .setSecondaryButton(CardService.newTextButton().setText('autodeletes')
      .setOnClickAction(CardService.newAction()
        .setFunctionName("all_autodeletes")))
  card.setFixedFooter(fixedFooter).build()

  // create p_0 label if one does not exist 
  const p0_id = check_p0_label()
  return [card.build()]
}

function get_num_unsub_emails(){
  // iterate through messages to get total number, 500 at a time 
  // start: pageToken = null 
  // end: pageToken = null 

  var num_messages = 0

  pageToken = null
  finished = false 
  while (pageToken == null | finished == false){
    Logger.log(pageToken)

    // pull message id's 500 at a time 
    var messageList = Gmail.Users.Messages.list('me', {
        q: '+unsubscribe',
        pageToken: pageToken,
        maxResults: 500,
      })

    //pull out message objects 
    var messages = messageList.messages
    // Logger.log(messages)
    num_messages += messages.length

    // terminate loop if pageToken == null again 
    pageToken = messageList.nextPageToken
    
    if (pageToken == null){
      finished=true
    }
  }
  Logger.log(num_messages)
  
  return num_messages


}

function get_num_counted(){
  const userProperties = PropertiesService.getUserProperties()
  const data_str = userProperties.getProperty('sender_data')

  data = JSON.parse(data_str)
  // Logger.log(data)

  data.forEach(function(value){
    dat = value[1]
    Logger.log(dat)
  })
}

// in-progress page
  // render in-progress page if running 
  // somehow run number of emails scanned? 
    // grab number of emails in inbox from getProfile
    // set property of number ran each batch 
    // percentage indicator? 
    // update results as it scans? 

  // fun fact? c&h comic strip? 

function zero_loading(){
  // create a new card
  var card = CardService.newCardBuilder()

  // create text 
  var loading_text = CardService.newDecoratedText()
    .setText('Loading times vary with your internet speed. Come back in a bit!')

  // add text to card; maybe change to image to make it look better?
  var cardSection = CardService.newCardSection()
    .setHeader("Section header")
    .addWidget(loading_text);
  
  card.addSection(cardSection)
  return card
}



// run zero
  // clear existing data, if any 
  // set property to in-progress 
  // run zero 
  // update properties at end 
  // 6-minute timer OR 30-minute timer 
  // return whether or not done
    // if pageToken == null, set property to done 
    // OR if num emails == num scanned emails 

function test_empty_properties(){
  const userProperties = PropertiesService.getUserProperties()
  Logger.log(userProperties.getKeys().length)

  num = userProperties.getKeys().length

  run = true
  if (num == 0){
    Logger.log('0')
  }
  else if (run){
    Logger.log('run')
  }

}
// need a trigger for this to work properly
function run_zero_background(e){
  const userProperties = PropertiesService.getUserProperties()

  // get total number of relevant emails 
  var num_zero_emails = get_num_unsub_emails()

  var pageToken = e.parameters.pageToken // grab start point 

  var zero_background_data
  if (pageToken == null){
    // clear previous run 
    userProperties.setProperty('sender_data', '{}')

    // new empty map for run
    zero_background_data = new Map() 
  }
  else{
    // pull current data 
    zero_background_data_str = userProperties.getProperty('sender_data')

    // new map with data for run 
    zero_background_data = new Map(JSON.parse(zero_background_data_str))
  }

  var end = false 
  while (pageToken != null | end == false){
    Logger.log(pageToken)

    // scan 500 messages, grab data, update properties 
    update_zero_output = update_zero(zero_background_data, pageToken)
    pageToken = update_zero_output[1] // update pageToken to next 500 emails 
    
    // terminate while loop if pageToken becomes false again 
    if (pageToken == null){
      end = true 
      userProperties.setProperty('pageToken', '')
      pageToken = ''  
    }
    else{
      userProperties.setProperty('pageToken', pageToken)
    }
  }

  // render 
  var card = CardService.newCardBuilder()
  card.addSection(create_searchbar(''))


  const data = new Map(JSON.parse(userProperties.getProperty('sender_data'))) // grab data 
  const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count)) // sort data descending 

  // build cards and add to home card
  sorted_data.forEach(function(value, key){
    home = CardService.newCardSection()
      .addWidget(create_card(key, value))
      .addWidget(create_cardbuttons(value.link, key, value.mailto))
    card.addSection(home)
  })

  
  // create footer 
  var fixedFooter = CardService.newFixedFooter()
    .setPrimaryButton(CardService.newTextButton().setText("Run Zero")
      .setOnClickAction(CardService.newAction()
        .setFunctionName("run_zero_background")
        .setParameters({'pageToken': pageToken})))
    .setSecondaryButton(CardService.newTextButton().setText('autodeletes')
      .setOnClickAction(CardService.newAction()
        .setFunctionName("all_autodeletes")))
  card.setFixedFooter(fixedFooter)

  return [card.build()]


}

// // render everything 
//   // render old if data is present + pageToken == null
//   // render in-progress if data is present + pageToken != null 
//   // render welcome if no data present or pageToken == null 
//   // run button
//   // implement try/catch? 

function p_0(){
  // create a new card
  var card = CardService.newCardBuilder()

  // setup 
  const userProperties = PropertiesService.getUserProperties()
  var pageToken = userProperties.getProperty('pageToken')

  // check userproperties
  if (userProperties.getKeys().length == 0){
    // if nothing has ever run (first run)
    Logger.log('first run!')
    userProperties.setProperty('pageToken', '')
    pageToken = ''
    userProperties.setProperty('sender_data', '')
    userProperties.setProperty('autodeletes', '{}')

    // render welcome page 
    var welcome_text = CardService.newDecoratedText().setText('Welcome to Project Zero!');
    var welcome = CardService.newCardSection().addWidget(welcome_text)
    card.addSection(welcome)
  }

  else if (pageToken == ''){
    Logger.log('x run')
    // run again after a completed run 
    // add search bar
    card.addSection(create_searchbar(''))

    const data = new Map(JSON.parse(userProperties.getProperty('sender_data'))) // grab data 
    const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count)) // sort data descending 

    // build cards and add to home card
    sorted_data.forEach(function(value, key){
      home = CardService.newCardSection()
        .addWidget(create_card(key, value))
        .addWidget(create_cardbuttons(value.link, key, value.mailto))
      card.addSection(home)
    })
  }

  else if (pageToken != ''){
    Logger.log('continue run')
    // start a run that was disconnected 
    // persist all settings

    // render in-progress page (can't distinguish between in-progress running and in-progress paused)
    // solution: create new property called "Done" that tracks it, and add a condition in this elseif
    var inprogress_text = CardService.newDecoratedText().setText('Scan in-progress');
    var inprogress = CardService.newCardSection().addWidget(inprogress_text)
    card.addSection(inprogress) 

  }
  else {
    Logger.log('error!! corner case unchecked in p_0')
    var error_text = CardService.newDecoratedText().setText('error!! corner case unchecked in p_0');
    var error = CardService.newCardSection().addWidget(error_text)
    card.addSection(error) 
  }

  // create footer 
  var fixedFooter = CardService.newFixedFooter()
    .setPrimaryButton(CardService.newTextButton().setText("Run Zero")
      .setOnClickAction(CardService.newAction()
        .setFunctionName("run_zero_background")
        .setParameters({'pageToken': pageToken})))
    .setSecondaryButton(CardService.newTextButton().setText('autodeletes')
      .setOnClickAction(CardService.newAction()
        .setFunctionName("all_autodeletes")))
  card.setFixedFooter(fixedFooter)

  // create p_0 label if one does not exist 
  const p0_id = check_p0_label()

  return [card.build()]
}

function batch_trash(message_ids){

  while (message_ids.length){
    const ids_75 = message_ids.splice(0, 10);

    //create list of objects containing the requests 
    var body = ids_75.map(function(id){
      return {
          method: "POST", 
          endpoint: "https://www.googleapis.com/gmail/v1/users/" + 'me' + "/messages/" + id + '/trash'
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
    Logger.log(res)
  }

 
}

function top_sender(senders){
  return Object.keys(senders).reduce((a, b) => senders[a] > senders[b] ? a : b)
}

function create_card(key, value){
  const sender = top_sender(value.senders)
  const text = '<b>' + '('+ value.count + ') ' + sender + '<b>'

  const email_card = CardService.newDecoratedText()
    .setText(text)
    .setBottomLabel(key)
    .setWrapText(true)
    // .setOpenLink(CardService.newOpenLink().setUrl(search))
    .setOnClickAction(CardService.newAction().setFunctionName('card_details')
    .setParameters({"email": key, "senders": JSON.stringify(value.senders)}))
  return email_card
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

function autodelete_buttons(email){
  // Logger.log('autodelete_buttons')
  // Logger.log(email)
  const autodelete_buttons = CardService.newButtonSet()
    .addButton(CardService.newTextButton()
      .setText('Add Autodelete')
      .setOnClickAction(CardService.newAction().setFunctionName('add_autodelete')
      .setParameters({"email": email})))
    // .addButton(CardService.newTextButton()
    //   .setText(unsub_text)
    //   .setOnClickAction(CardService.newAction().setFunctionName('unsubscribe')
    //   .setParameters({"link": link, 'mailto': mailto, 'search': search})))

  return autodelete_buttons
}

function card_details(e){
  var card = CardService.newCardBuilder()

  const email = e.parameters.email
  // Logger.log(e.parameters.email)

  const userProperties = PropertiesService.getUserProperties();
  const zero_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
  // logData(zero_data)

  const details = zero_data.get(email)
  const count = details.count
  const senders = Object.entries(details.senders)
  const mailto = details.mailto
  const link = details.link

  var text = '<b>' + '('+ count + ') ' + email + '</b>' + '<br>'

  for ([key, value] of senders){
    Logger.log(key)
    Logger.log(value)
    text = text + '('+ value + ') ' + key + '<br>'
  }

  const search = 'https://mail.google.com/mail/u/0/#search/from%3A+' + email

  const sender_details = CardService.newDecoratedText()
    .setText(text)
    .setWrapText(true)
    .setOpenLink(CardService.newOpenLink().setUrl(search))
  
  card.addSection(CardService.newCardSection()
    .addWidget(sender_details))

  const current_autodeletes = JSON.parse(userProperties.getProperty('autodeletes'))


  let autodelete_text = 'Autodelete Frequency: None'
  let autodelete_button_text = 'Add'
  Logger.log(current_autodeletes[email])
  // test_output(current_autodeletes[email])

  if (current_autodeletes[email]){
    const autodelete_frequency = current_autodeletes[email]
    autodelete_text = 'Autodelete Frequency: ' + autodelete_frequency + ' days'
    autodelete_button_text = 'Edit'
  }

  var autodelete_widget = CardService.newDecoratedText()
    .setText(autodelete_text)
    .setButton(CardService.newTextButton()
      .setText(autodelete_button_text)
      .setOnClickAction(CardService.newAction().setFunctionName('edit_autodelete')
        .setParameters({"text": text, "email": email})))

  // render button that passes form data to button 

  // add widgets to new section, and return 
  card.addSection(CardService.newCardSection()
    .addWidget(autodelete_widget))
  
  card.addSection(CardService.newCardSection()
    .addWidget(create_cardbuttons(link, email, mailto)))

  return [card.build()]
}

function search(e){
  var input = e.formInput.search
  // Logger.log(input)

  if (input!=null){
    // Logger.log('not null')
    input = input.toLowerCase()

    const userProperties = PropertiesService.getUserProperties();
    // Logger.log(userProperties.getProperties())

    // create a card 
    var card = CardService.newCardBuilder()

    // create search bar 
    card.addSection(create_searchbar(input))
    var success = false 

    const sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
    const sorted_data = new Map([...sender_data].sort((a,b) => b[1].count - a[1].count));
    
    sorted_data.forEach(function(value, key){
      // Logger.log(Object.keys(value.senders))

      if (Object.keys(value.senders).some(substring=>substring.toLowerCase().includes(input)) || key.includes(input)){
        // Logger.log(value.senders)
        success = true
        // Logger.log(key)
        const search_result = CardService.newCardSection()
        search_result.addWidget(create_card(key, value))
        search_result.addWidget(create_cardbuttons(value.link, key, value.mailto))
        card.addSection(search_result)
      }
    })

    if(success){

      return [card.build()]
    }
    else{
      Logger.log('not found')
      return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification()
          .setText('No match found'))
      .build();
    }
  }
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

  const parameter = 'from:'+ e.parameters.email
  const messageList = Gmail.Users.Messages.list('me', {
    q: parameter,
    pageToken: null,
    maxResults: 500,
  })

  const messages = messageList.messages
  if (messages){
    let message_ids = messages.map(message => message.id);
  Logger.log(message_ids)

  batch_trash(message_ids)

  text = "Deleted all emails from " + e.parameters.email

  return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification()
          .setText(text))
      .build();
  }
}

function label_new_autodeletes(message_headers){

  // grab userProperties 
  const userProperties = PropertiesService.getUserProperties()

  // pull current autodelete email-expiration pairs 
  const autodeletes = JSON.parse(userProperties.getProperty('autodeletes'))
  Logger.log(autodeletes)

  // get today 
  const today_UTC = get_today_UTC() 

  message_headers.forEach(function(header, index){
    // get senders for each message 
    const sender = JSON.parse(header).payload.headers.find(item => item.name === 'From').value

    // pull email from sender using regex 
    var email = sender.match(/<([^<]*)>/, "");
    if (email){
      email = email[1]
    }
    else{
      email = sender
    }
    // Logger.log(email)

    if (email in autodeletes){
      // Logger.log('email in autodeletes')
      const expire = autodeletes[email]

      const message_id = JSON.parse(header).id
      // Logger.log(message_id)

      // calculate date of deletion in UTC 
      var expire_UTC = (expire * 86400000) + today_UTC
      
      // calculate date of deletion in string 
      var delete_date_string = new Date(expire_UTC).toLocaleDateString('en-US', {timeZone: 'UTC'}) 

      // create deletion label name 
      const p0_label_delete = 'p_0/' + delete_date_string

      // add to label 
      label_autodelete_message(p0_label_delete, message_id)
    }
  })
}

function all_autodeletes(){
  // grab userProperties 
  const userProperties = PropertiesService.getUserProperties()

  // create card 
  var card = CardService.newCardBuilder()
  .setHeader(CardService.newCardHeader().setTitle("Active Autodeletes").setSubtitle("Emails from these senders will auto-delete."))

  // pull current autodelete email-expiration pairs 
  const autodeletes = JSON.parse(userProperties.getProperty('autodeletes'))
  Logger.log(autodeletes)

  if (autodeletes){
    const zero_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))

    Logger.log(zero_data)

    for (const [email, expiration] of Object.entries(autodeletes)) {
      const autodelete_text = '<u>' + email + '</u>'+ '<br>' + 'Autodelete Frequency: '+ '<b>'+ expiration + ' days' + '</b>'
      const autodelete_button_text = 'Edit'
      
      const details = zero_data.get(email)
      const edit_text = '<b>' + '('+ details.count + ') ' + email

      var autodelete_widget = CardService.newDecoratedText()
        .setText(autodelete_text)
        .setWrapText(true)
        .setButton(CardService.newTextButton()
          .setText(autodelete_button_text)
          .setOnClickAction(CardService.newAction().setFunctionName('edit_autodelete')
            .setParameters({"text": edit_text, "email": email})))
      
      const autodelete_section = CardService.newCardSection()
          .addWidget(autodelete_widget)
      card.addSection(autodelete_section)
    }
  }

  // create footer 
  var fixedFooter = CardService.newFixedFooter()
    .setPrimaryButton(CardService.newTextButton().setText("Add New Autodelete")
      .setOnClickAction(CardService.newAction()
        .setFunctionName("add_custom_autodelete")))
  card.setFixedFooter(fixedFooter).build()
  
  return [card.build()]
}

function add_custom_autodelete(){
   // send notification
    return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification()
            .setText('add custom autodelete'))
        .build();
}

function delete_daemon(){

  // pull current date in UTC
  const today_UTC = get_today_UTC()
  Logger.log(today_UTC)

  // convert current date in UTC to string date 
  const today_string = new Date(today_UTC).toLocaleDateString('en-US', {timeZone: 'UTC'}) 

  // get today's label name
  const today_label_str = 'p_0/' + today_string // today's label name 
  const today_label_id = check_date_label(today_label_str)
  Logger.log(today_label_str)
  Logger.log(today_label_id)

  if (today_label_id){
    // get messages in today's label 
    const ids_to_delete = get_label_message_ids(today_label_id)
    Logger.log('ids in today label')
    Logger.log(ids_to_delete)

     // delete today's ids 
    batch_trash(ids_to_delete)

    // delete label 
    delete_label(today_label_id)
  }

  else {
    Logger.log('nothing to delete today!')
  }


}

function add_autodelete(e){

  Logger.log(e)

  const email = e.parameters.email //e.parameters.email 
  const expiration = e.formInput.frequency_radio //e.parameters.expiration
  Logger.log(expiration)

  if (expiration == 'none'){
    // remove autodelete in properties 
    remove_autodelete(email)

    // remove autodelete filter 
    delete_filter(email)

    // send notification
    return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification()
            .setText('Removed Autodelete for ' + email))
        .build();
  }

  // get autodelete from userProperties
  const userProperty = PropertiesService.getUserProperties()
  const autodelete_strings = userProperty.getProperty('autodeletes')
  Logger.log(autodelete_strings)

  // convert userProperties to autodelete data
  var current_autodeletes = JSON.parse(autodelete_strings)
  Logger.log(current_autodeletes)

  // add new autodelete key-value pair 
  current_autodeletes[email] = expiration
  Logger.log(current_autodeletes)

  // add autodelete to userproperties 
  const new_autodeletes = JSON.stringify(current_autodeletes)
  Logger.log(new_autodeletes)
  userProperty.setProperty('autodeletes', new_autodeletes)  

  // create notification text 
  const text = 'after ' + expiration + ' days, emails from ' + email + ' will be moved to Trash.'

  // send notification
  return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification()
          .setText(text))
      .build();
}

function remove_autodelete(email){
  // email = 'no-reply@yelp.com'
  // get autodeletes from userProperties 
  const userProperty = PropertiesService.getUserProperties()
  const autodelete_strings = userProperty.getProperty('autodeletes')
  Logger.log(autodelete_strings)

  // convert userProperties to autodelete data
  var current_autodeletes = JSON.parse(autodelete_strings)
  Logger.log(current_autodeletes)

  // remove specified autodelete
  delete current_autodeletes[email]

  // update userProperties 
  const new_autodeletes = JSON.stringify(current_autodeletes)
  Logger.log(new_autodeletes)
  userProperty.setProperty('autodeletes', new_autodeletes)
}

function edit_autodelete(e){

  const email = e.parameters.email
  const text = e.parameters.text

  var card = CardService.newCardBuilder()

  // describe autodelete functionality 
  const autodelete_explanation = CardService.newDecoratedText()
    .setWrapText(true)
    .setText(text)
    

  // form data for autodelete frequency 
  var frequency_radio = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.RADIO_BUTTON)
    .setTitle("Email Deletion Frequency")
    .setFieldName("frequency_radio")
    .addItem('None', 'none', true)
    .addItem("1 Day", "1", false)
    .addItem("3 Days", "3", false)
    .addItem("7 Days", "7", false)
    .addItem("14 Days", '14', false)

  // render button that passes form data to button
  const autodelete_buttons = CardService.newButtonSet()
    .addButton(CardService.newTextButton()
      .setText('Save Changes')
      .setOnClickAction(CardService.newAction().setFunctionName('add_autodelete')
      .setParameters({"email": email}))
      )

  // add widgets to new section, and return 
  card.addSection(CardService.newCardSection()
    .addWidget(autodelete_explanation)
    .addWidget(frequency_radio)
    .addWidget(autodelete_buttons))

  return [card.build()]
}

function update_properties(){
  // check if anything is set up 
  const userProperties = PropertiesService.getUserProperties();
  const data = userProperties.getProperty('sender_data')
  // Logger.log(data)

  if (data !== '' && data !== null){
    // grab all new (1 day old) messages with unsubscribe 
  const parameter = '+unsubscribe'+ '  newer_than:1d'
  const newmessage_list = Gmail.Users.Messages.list('me', {
    q: parameter,
    pageToken: null,
    maxResults: 500,
  })
  Logger.log('new messages:')
  Logger.log(newmessage_list)

  // update userProperties if any new
  const new_messages = newmessage_list.messages
  if (new_messages){
    const sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
    const new_headers = batchedHeaders(new_messages)
    // Logger.log(new_headers)
    const new_data = update_data(new_headers, sender_data)
    // Logger.log(typeof new_data)
    // logData(new_data)
    // Logger.log(new_data)
    // Logger.log(JSON.stringify(new_data))
    let new_data_str = JSON.stringify(Array.from(new_data.entries()))
    // Logger.log(new_data_str)
    PropertiesService.getUserProperties().setProperty('sender_data', new_data_str)

    // add label to new messages 
    label_new_autodeletes(new_headers)

  }

  // delete emails if needed 
  delete_daemon()
  }
}

function check_p0_label(){
  const p0_label = 'p_0'

  const all_labels = list_labels()
  existing_label = all_labels.find(label => label.name == p0_label)

  if (existing_label){
    Logger.log(existing_label.id) 
    return existing_label.id 
  }
  
  Logger.log('label does not yet exist')

  // create the label if it does not exist 
  add_label(p0_label)
  const label_id = check_p0_label()
  return label_id
}

function check_date_label(label_name){
  const all_labels = list_labels()
  existing_label = all_labels.find(label => label.name == label_name)

  if (existing_label){
    Logger.log(existing_label.id) 
    return existing_label.id 
  }

  Logger.log('label does not yet exist')
  return false

}

function get_label_id(name){

  const all_labels = list_labels()
  existing_label = all_labels.find(label => label.name == name)

  if (existing_label){
    Logger.log(existing_label.id) 
    return existing_label.id 
  }
  
  Logger.log('label does not yet exist')

  // create the label if it does not exist 
  add_label(name)
  const label_id = get_label_id(name)
  return label_id
}

function get_label_message_ids(label_id){
  // const label_id = 'Label_251'

  const label = Gmail.Users.Labels.get('me', label_id);
  Logger.log(label)

  const label_messages_list = Gmail.Users.Messages.list('me', {labelIds: [label_id]})
  Logger.log(label_messages_list)

  var label_message_ids = []
  if (label_messages_list.messages){

    label_messages_list.messages.forEach(function(message_thread){
      Logger.log(message_thread)
      label_message_ids.push(message_thread.id)
    })

    Logger.log(label_message_ids)
  }

  return label_message_ids
}

function list_labels(){
  // request all labels
  var all_labels = Gmail.Users.Labels.list('me').labels
  Logger.log(all_labels)

  return all_labels
}

function add_label(name){
  Logger.log(name)
  
  var resource = Gmail.newLabel();
  resource.labelListVisibility = "labelShow";
  resource.messageListVisibility = "show";
  resource.name = name;

  Gmail.Users.Labels.create(resource, 'me');
}

function label_autodelete_message(label_name, message_id){
  // get id 
  const label_id = get_label_id(label_name) // gets label id, or creates label and then returns label id

  // label message
  label_messages(label_id, message_id)

}

function delete_label(id){

  Gmail.Users.Labels.remove('me', id)

}

function label_messages(label_id, message_ids){
  // add a message to a label 
  // https://developers.google.com/gmail/api/reference/rest/v1/users.messages/batchModify
  Gmail.Users.Messages.batchModify({
    "ids": message_ids,
    'addLabelIds': [label_id],
    'removeLabelIds': []
  }, 'me')
}

function get_today_UTC(){
  const today = new Date()
  Logger.log(today)

  var ms = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  Logger.log(ms)

  return ms
}

function testUTCdate(){

  const todayUTC = get_today_UTC()
  Logger.log(typeof todayUTC)
  // calculate date of deletion in UTC 
  const expire_UTC = (1 * 86400000) + todayUTC
  
  // calculate date of deletion in string 
    const delete_date_string = new Date(expire_UTC).toLocaleDateString('en-US', {timeZone: 'UTC'})  
  Logger.log(delete_date_string)

  // today_string = new Date(delete_date_string).toLocaleDateString() 
  // Logger.log(today_string)


}

function newFilter(email, label_date) {
  
  // create filter
  var filter = Gmail.newFilter()

  // Make the filter activate when the to address is ${toAddress}
  filter.criteria = Gmail.newFilterCriteria()
  filter.criteria.from = email

  // Make the filter apply the label id of ${labelName}
  filter.action = Gmail.newFilterAction()
  const label_id = get_label_id(label_date)
  filter.action.addLabelIds = [label_id]

  // Add the filter to the user's ('me') settings
  Gmail.Users.Settings.Filters.create(filter, 'me')
}

function testFilter(){
  // create filter
  var filter = Gmail.newFilter()

  // Make the filter activate when the to address is ${toAddress}
  filter.criteria = Gmail.newFilterCriteria()
  filter.criteria.from = ''

  // Make the filter apply the label id of ${labelName}
  filter.action = Gmail.newFilterAction()
  const label_id = get_label_id('p_0/07/18/2023')
  filter.action.addLabelIds = [label_id]

  // Add the filter to the user's ('me') settings
  Gmail.Users.Settings.Filters.create(filter, 'me')
}

function deleteFilter(email_address){

  // list filters 
  const filter_objs = Gmail.Users.Settings.Filters.list('me')
  // Logger.log(list)

  if (filter_objs){  

    const filters_list = filter_objs.filter
    // Logger.log(filters_list)

    // search for filter with the given email as the criteria 
    var existing_filter = filters_list.find(filter => filter.criteria.from === email_address)
    Logger.log(existing_filter)

    if (existing_filter){
      filter_id = existing_filter.id // get filter ID 
      // Logger.log(filter_id)

      Gmail.Users.Settings.Filters.remove('me', filter_id) // delete Filter 

      return 'True'
    }
  }

  return 'False' 

}

function test_del_filter(){
  email = 'jtan266@gmail.com'

  success = deleteFilter(email)
}  
