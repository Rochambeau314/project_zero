/***
 * v19: 
 * autodelete functionality with labels
 * (done!!) 
 */

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

function testLabelNewAutodeletes(){
  // grab all new (1 day old) messages with unsubscribe 
  const parameter = '+unsubscribe'+ '  newer_than:1d'
  const newmessage_list = Gmail.Users.Messages.list('me', {
    q: parameter,
    pageToken: null,
    maxResults: 500,
  })
  Logger.log('new messages:')
  Logger.log(newmessage_list)

  const new_messages = newmessage_list.messages
  const new_headers = batchedHeaders(new_messages)

  label_new_autodeletes(new_headers)


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
    // .setSecondaryButton(CardService.newTextButton().setText('autodeletes')
    //   .setOnClickAction(CardService.newAction()
    //     .setFunctionName("all_autodeletes")))
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
    // remove autodelete 
    remove_autodelete(email)    

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
  // grab current properties
  
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
    const userProperties = PropertiesService.getUserProperties();

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

function update_zero(zero_data, pageToken){
  // // call in data 
  // const userProperties = PropertiesService.getUserProperties();
  // var zero_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))

  var pageToken

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
  const userProperties = PropertiesService.getUserProperties();
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

  // dat.ForEach(function(d){
  //   Logger.log(d)
  // })

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
    // Logger.log('2 objects in userProperties')
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






function testBatchTrash(){
  fabletics_id = ['1853c4c5992e52d5', '1853012e72a20b0c']
  batch_trash(fabletics_id)
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

function logSenders(){
  const userProperties = PropertiesService.getUserProperties();
  const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
  data.forEach(function(value, key){
    const senders = value.senders
    Logger.log(senders)
  })
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

function logData(data){
  if(data){
    data.forEach(function(value, key){
      Logger.log(value)
      Logger.log(key)
    })
  }

}

function logAutodeleteQueue(){
  // get autodeletes from userProperties 
  const userProperty = PropertiesService.getUserProperties()
  const autodelete_queue_str = userProperty.getProperty('autodelete_queue')
  Logger.log(autodelete_queue_str)

  // convert userProperties to autodelete data
  var current_autodelete_queue = JSON.parse(autodelete_queue_str)
  Logger.log(current_autodelete_queue)

  Logger.log(Object.entries(current_autodelete_queue))

  // current_autodelete_queue.forEach(function(value, key){
  //   Logger.log(value)
  //   Logger.log(key)
  // })
}

function cleanAutodeleteQueue(){
  userProperty = PropertiesService.getUserProperties()

  userProperty.setProperty('autodelete_queue', '{}')
  // const today = get_today_UTC() 

  // // pull current autodelete email-expiration pairs 
  // const autodeletes = userProperty.getProperty('autodeletes')
  // Logger.log(autodeletes)

  // // pull current autodelete queue 
  // const autodelete_queue_str = userProperty.getProperty('autodelete_queue')
  // const current_autodelete_queue = JSON.parse(autodelete_queue_str)
  // Logger.log(current_autodelete_queue)

  // for (const [key, value] of Object.entries(current_autodelete_queue)) {
  //   if (key <= today){
  //     Logger.log('need to delete')
  //     Logger.log(key)

  //     batch_trash(value)

  //     delete current_autodelete_queue[key]

  //     userProperty.setProperty('autodelete_queue', current_autodelete_queue)
  //   } 
  // }
  // current_autodelete_queue.forEach(function(stamp, queue){
  //   Logger.log(stamp)
  //   Logger.log(queue)
  // })
  // if (today_UTC in current_autodelete_queue){
  //   Logger.log('need to delete today')

  //   const ids_for_deletion = current_autodelete_queue[today_UTC]
  //   Logger.log(ids_for_deletion)

  //   batch_trash(ids_for_deletion)    
  // }
}

function logAutodeletes(){
  // get autodelete from userProperties 
  const userProperty = PropertiesService.getUserProperties()
  const autodelete_strings = userProperty.getProperty('autodeletes')
  Logger.log(autodelete_strings)
}

function test_output(input){
  // Log string in case it is not a string 
  Logger.log(input)

  // send notification if it is a string
  return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification()
          .setText(String(input)))
      .build();
}

/***
 * v18: 
 * Adding in email sender details onclick 
 * (done)
 */

// function update_zero(zero_data, pageToken){
//   // // call in data 
//   // const userProperties = PropertiesService.getUserProperties();
//   // var zero_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))

//   var pageToken

//   // scan 500 emails in 1 run, 500 at a time 
//   for (let i=0; i<1; i++){
//     // pull message id's 500 at a time 
//     var messageList = Gmail.Users.Messages.list('me', {
//         q: '+unsubscribe',
//         pageToken: pageToken,
//         maxResults: 500,
//       })

//     //pull out message objects 
//     var messages = messageList.messages
//     // Logger.log(messages)

//     var messages_50 = [] // batch request messages 50 at a time 
//     while (messages.length){
//       messages_50.push(messages.splice(0, 50));
//     }
//     // Logger.log(messages_50.length)
    
//     // send requests for message headers in batches of 50 
//     messages_50.forEach(function(message_block){
//       // Logger.log('batch')
//       const message_headers = batchedHeaders(message_block, zero_data)
//       // Logger.log(message_headers)

//       zero_data = update_data(message_headers, zero_data)
//       // Logger.log(zero_data)
//     })
//     pageToken = messageList.nextPageToken //reassign page token 
//   }
//   const updated_data = JSON.stringify(Array.from(zero_data.entries()));
//   const userProperties = PropertiesService.getUserProperties();
//   userProperties.setProperty('sender_data', updated_data)
//   return [zero_data, pageToken]
// }

// function batchedHeaders(messageList){
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

// function update_data(headers, zero_data){
//   // isolates List-Unsubscribe header data from each message 
//   headers.map(function(e){

//     const sender_full = JSON.parse(e).payload.headers.find(item => item.name === 'From').value
//     var email = sender_full.match(/<([^<]*)>/, "");
//     if (email){
//       email = email[1]
//     }
//     else{
//       email = sender_full
//     }

//     var name = sender_full.replace(/<[^>]*>/g, "").replaceAll('"', '')
//     if (name == null){
//       name = email
//     }
//     // Logger.log(name)

//     var unsub_link = 'not found'
//     var mailto = 'not found'
//     var unsub_array = JSON.parse(e).payload.headers.find(item => item.name === 'List-Unsubscribe')
//     if (unsub_array){
//       const unsub_match = unsub_array.value.match(/https?:\/\/(.+?)(\s|,)/);
//       if (unsub_match) {
//         unsub_link = unsub_match[0];
//         // Logger.log(unsub_link)
//       }
//       var mailto_match = unsub_array.value.match(/mailto:(.+?)(\s|,|>)/);
//       if (mailto_match) {
//         mailto = mailto_match[1];
//       }
//     }
//     const old_data = zero_data.get(email)
//     var current_senders = {name: 1}
//     if (old_data){
//       var current_senders = old_data.senders
//       if (name in current_senders){
//         current_senders[name] = current_senders[name] + 1 
//       }
//       else{
//         current_senders[name] = 1;
//       }
//       zero_data.set(email, 
//       {'count':old_data.count + 1, 'link': old_data.link, 'mailto': old_data.mailto, 'senders': current_senders })
//     }

//     else{
//       zero_data.set(email, {'count':1, 'link': unsub_link, 'mailto': mailto, 'senders': {[name]: 1} })
//     }
//   })
//   return zero_data
// }

// function top_sender(senders){
//   return Object.keys(senders).reduce((a, b) => senders[a] > senders[b] ? a : b)
// }

// function create_card(key, value){
//   const sender = top_sender(value.senders)
//   const text = '<b>' + '('+ value.count + ') ' + sender + '<b>'

//   const email_card = CardService.newDecoratedText()
//     .setText(text)
//     .setBottomLabel(key)
//     .setWrapText(true)
//     // .setOpenLink(CardService.newOpenLink().setUrl(search))
//     .setOnClickAction(CardService.newAction().setFunctionName('card_details')
//     .setParameters({"email": key, "senders": JSON.stringify(value.senders)}))
//   return email_card
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

// function card_details(e){
//   var card = CardService.newCardBuilder()

//   const email = e.parameters.email
//   // Logger.log(e.parameters.email)

//   const userProperties = PropertiesService.getUserProperties();
//   const zero_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//   // logData(zero_data)

//   const details =zero_data.get(email)
//   const count = details.count
//   const senders = Object.entries(details.senders)
//   const mailto = details.mailto
//   const link = details.link

//   var text = '<b>' + '('+ count + ') ' + email + '</b>' + '<br>'

//   for ([key, value] of senders){
//     Logger.log(key)
//     Logger.log(value)
//     text = text + '('+ value + ') ' + key + '<br>'
//   }

//   const search = 'https://mail.google.com/mail/u/0/#search/from%3A+' + email

//   const sender_details = CardService.newDecoratedText()
//     .setText(text)
//     .setWrapText(true)
//     .setOpenLink(CardService.newOpenLink().setUrl(search))
  
//   card.addSection(CardService.newCardSection()
//     .addWidget(sender_details)
//     .addWidget(create_cardbuttons(link, email, mailto)))
  


//   return [card.build()]
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
//     // Logger.log('2 objects in userProperties')
//     sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//     pageToken = userProperties.getProperty('pageToken')
//   }
//   else if (userProperties.getKeys().length ==1){
//     // Logger.log('rerunning!')
//     userProperties.setProperty('pageToken', '')
//     sender_data = new Map()
//     userProperties.setProperty('sender_data', '')

//   }
//   else{
//     sender_data = new Map()
//     pageToken = null
//   }

//   sender_data = update_zero(sender_data, pageToken)

//   const data = sender_data[0]
//   const sorted_data = new Map([...data].sort((a,b) => b[1].count - a[1].count));

//   sorted_data.forEach(function(value, key){
//     // Logger.log(value)
//     // Logger.log(value.link)
//       const home = CardService.newCardSection()
//         .addWidget(create_card(key, value))
//         .addWidget(create_cardbuttons(value.link, key, value.mailto))
//       card.addSection(home)
//   })

//   const property_data = JSON.stringify(Array.from(sender_data[0].entries()));
//   let button_text = ''
//   if (sender_data[1]){
//     // Logger.log('scan next 5')
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
//         .addWidget(create_cardbuttons(value.link, key, value.mailto))
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

// function logSenders(){
//   const userProperties = PropertiesService.getUserProperties();
//   const data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//   data.forEach(function(value, key){
//     const senders = value.senders
//     Logger.log(senders)
//   })
// }

// function search(e){
//   var input = e.formInput.search
//   // Logger.log(input)

//   if (input!=null){
//     // Logger.log('not null')
//     input = input.toLowerCase()

//     const userProperties = PropertiesService.getUserProperties();
//     // Logger.log(userProperties.getProperties())

//     // create a card 
//     var card = CardService.newCardBuilder()

//     // create search bar 
//     card.addSection(create_searchbar(input))
//     var success = false 

//     const sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//     const sorted_data = new Map([...sender_data].sort((a,b) => b[1].count - a[1].count));
    
//     sorted_data.forEach(function(value, key){
//       // Logger.log(Object.keys(value.senders))

//       if (Object.keys(value.senders).some(substring=>substring.toLowerCase().includes(input)) || key.includes(input)){
//         Logger.log(value.senders)
//         success = true
//         // Logger.log(key)
//         const search_result = CardService.newCardSection()
//         search_result.addWidget(create_card(key, value))
//         search_result.addWidget(create_cardbuttons(value.link, key, value.mailto))
//         card.addSection(search_result)
//       }
//     })

//     if(success){

//       return [card.build()]
//     }
//     else{
//       Logger.log('not found')
//       return CardService.newActionResponseBuilder()
//       .setNotification(CardService.newNotification()
//           .setText('No match found'))
//       .build();
//     }
//   }
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

// function update_properties(){
//   // grab current properties
  
//   // grab all new (1 day old) messages with unsubscribe 
//   const parameter = '+unsubscribe'+ '  newer_than:1d'
//   const newmessage_list = Gmail.Users.Messages.list('me', {
//     q: parameter,
//     pageToken: null,
//     maxResults: 500,
//   })
//   Logger.log(newmessage_list)

//   // update userProperties if any new
//   const new_messages = newmessage_list.messages
//   if (new_messages){
//     const userProperties = PropertiesService.getUserProperties();

//     const sender_data = new Map(JSON.parse(userProperties.getProperty('sender_data')))
//     const new_headers = batchedHeaders(new_messages)
//     Logger.log(new_headers)
//     const new_data = update_data(new_headers, sender_data)

//     const zero_data = JSON.stringify(Array.from(new_data.entries()));
//     PropertiesService.getUserProperties().setProperty('sender_data', zero_data)
//   }
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

// function logData(data){
//   if(data){
//     data.forEach(function(value, key){
//       Logger.log(value)
//       Logger.log(key)
//     })
//   }

// }

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


  
