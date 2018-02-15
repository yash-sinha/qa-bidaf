	var express = require('express');
	var app = express();
	var path = require('path');
	var formidable = require('formidable');
	// var fs = require('fs');
	var bodyParser = require('body-parser');
	var child;
	var child_cp;
	var child_cp1;
	var Promise = require('bluebird');
	var exec = require('child_process').exec;
	var promises = [];
	const fs = require('fs');

	var conf_threshold = 10;
	var last_question_asked = "";
	var question_dict = new Array();
	var question_confidence = new Object();
	app.use(bodyParser.urlencoded({ extended: true }));
	// var cdata=copyData("count.txt","count.txt");
	app.use(express.static(path.join(__dirname, 'public')));
	app.get('/', function(req, res){
		// clear(req);
		// res.sendFile(path.join(__dirname, 'views/index.html'));
		child = exec("rm -rf passage.txt", function(error, stdout, stderr) {
		// command output is in stdout
		//console.log(`stdout: ${stdout}`);
		if (error !== null) {
			console.log('exec error: ' + error);
		}
		});
		child.on('exit', function() {
			//initialize
			question_dict.push({question: 'Where do you want to go?', filename: 'res_where.txt', asked: 0, answer: "", satisfied: 0, prefix: ". go to ", confidence: -1});
			question_dict.push({question: 'From where do you want to leave?', filename: 'res_source.txt', asked: 0, answer: "", satisfied: 0, prefix: ". leave from ", confidence: -1});
			// question_dict.push({question: 'What is your name?', filename: 'res_name.txt', asked: 0, answer: "", satisfied: 0, prefix: ". name is ", confidence: -1});
			// question_dict.push({question: 'When do you want to go?', filename: 'res_when.txt', asked: 0, answer: "", satisfied: 0, prefix: ". want to go on  ", confidence: -1});
			// question_dict.push({question: 'What time do you want to leave?', filename: 'res_time.txt', asked: 0, answer: "", satisfied: 0, prefix: ". time to go  ", confidence: -1});
			// question_dict.push({question: 'What is your passport number?', filename: 'res_passport.txt', asked: 0, answer: "", satisfied: 0, prefix: ". passport number  ", confidence: -1});

			for (i = 0; i < question_dict.length; i++) {
				var ques = question_dict[i].question;
				question_confidence[ques]= -1;
			}
			// question_confidence['Where do you want to go?']= -1;
			// question_confidence['From where do you want to leave?']= -1;
			// question_confidence['What is your name?']= -1;
			// question_confidence['When do you want to go?']= -1;
			// question_confidence['What time do you want to leave?']= -1;
			// question_confidence['What is your passport number?']= -1;
			res.send('Hi there! How may I help you today?');
		});
	});
	// app.get('/home', function(req, res){
	// 	return res.redirect('/');
	// });


	// question_dict.push({question: 'Where do you want to go?', filename: 'res_where.txt', asked: 0, answer: "", satisfied: 0, prefix: ". go to ", confidence: -1});
	// // question_dict.push({question: 'From where do you want to leave?', filename: 'res_source.txt', asked: 0, answer: "", satisfied: 0, prefix: ". leave from ", confidence: -1});
	// // question_dict.push({question: 'What is your name?', filename: 'res_name.txt', asked: 0, answer: "", satisfied: 0, prefix: ". name is ", confidence: -1});
	// // question_dict.push({question: 'When do you want to go?', filename: 'res_when.txt', asked: 0, answer: "", satisfied: 0, prefix: ". want to go on  ", confidence: -1});
	// // question_dict.push({question: 'What time do you want to leave?', filename: 'res_time.txt', asked: 0, answer: "", satisfied: 0, prefix: ". time to go  ", confidence: -1});
	// // question_dict.push({question: 'What is your passport number?', filename: 'res_passport.txt', asked: 0, answer: "", satisfied: 0, prefix: ". passport number  ", confidence: -1});
  //
  //
	// // var question_dict = new Object();
	// // question_dict['Where do you want to go?']= '';
	// // question_dict['What is your name?']= '';
	// // question_dict['When do you want to go?']= '';
	// // question_dict['What time do you want to leave?']= '';
	// // question_dict['From where do you want to leave?']= '';
	// // question_dict['What is your passport number?']= '';
  //
	// // var filenames = new Object();
	// // filenames['Where do you want to go?']= 'res_where.txt';
	// // filenames['What is your name?']= 'res_name.txt';
	// // filenames['When do you want to go?']= 'res_when.txt';
	// // filenames['What time do you want to leave?']= 'res_time.txt';
	// // filenames['From where do you want to leave?']= 'res_source.txt';
	// // filenames['What is your passport number?']= 'res_passport.txt';
  //
	// question_confidence['Where do you want to go?']= -1;
	// question_confidence['What is your name?']= -1;
	// question_confidence['When do you want to go?']= -1;
	// question_confidence['What time do you want to leave?']= -1;
	// question_confidence['From where do you want to leave?']= -1;
	// question_confidence['What is your passport number?']= -1;

	function getNextQuestion(){
		if(question_confidence.length == 0){
			return question_dict+ "\nThat's all the information I needed. Crunching data for best deals!";
		}
		for (i = 0; i < question_dict.length; i++) {
			if(question_dict[i].answer == ""){
				return question_dict[i].question;
			}
		}
		// for(var key in question_dict){
		// 	if(question_dict[key] == ''){
		// 		return key;
		// 	}
		// }
		confidence = getSortedKeys(question_confidence);
		if(question_confidence[confidence[0]] >= conf_threshold) {
			return "done";
		}
		return confidence[0];
	}

	function getSortedKeys(obj) {
    var keys = []; for(var key in obj) keys.push(key);
    return keys.sort(function(a,b){return obj[a]-obj[b]});
	}

	function checkQuestion(question){
		//python docqa/scripts/run_on_user_documents.py squad/ "Where do you want to go?" passage.txt
		return new Promise(function (resolve, reject) {
				var idx = getQuestionIndex(question);
				var command = "python docqa/scripts/run_on_user_documents.py squad/ \""+question+"\" passage.txt > " + question_dict[idx].filename;
				console.log(command);
				child = exec(command, function(error, stdout, stderr) {
			  // command output is in stdout
			  //console.log(`stdout: ${stdout}`);
				if (error !== null) {
					console.log('exec error: ' + error);
				}
			  });
				child.on('exit', function() {
					child_read_result = exec("tail -r " + question_dict[idx].filename + " | sed -n '1,2p'", function (error, stdout, stderr) {
      			if (error !== null) {
          		console.log('exec error: ' + error);
      			}
						else{
							var answer_list = stdout.split("\n");
							var answer = answer_list[1].split(":")[1].trim();
							var confidence = parseFloat(answer_list[0].split(":")[1].trim());
							// console.log(question_confidence[question]);
							// console.log(question_dict[idx].satisfied == 0 && question_confidence[question] <= confidence && question_confidence[question] != undefined);
							if((question_dict[idx].satisfied == 0 && question_confidence[question] <= confidence) || question_confidence[question] == undefined){
								// console.log("entered");
								question_dict[idx].answer = answer;
								question_confidence[question] = confidence;
								question_dict[idx].confidence = confidence;
							}

							if(confidence >= conf_threshold) {
								question_dict[idx].satisfied = 1;
							}
							// console.log(answer[1].split(":")[1].trim());

						}
						resolve(question_confidence);
   				});
				});
		});

	}

	function getQuestionIndex(question){
		for (i = 0; i < question_dict.length; i++) {
			if(question_dict[i].question == question){
				return i;
			}
		}
	}

	function update_question_dict(res, confirm){
		for (i = 0; i < question_dict.length; i++) {
			// console.log(last_question_asked);
			if(confirm == true && question_dict[i].question == last_question_asked){
				question_dict[i].satisfied == 1;
				delete question_confidence.last_question_asked;
				last_question_asked = "";
				// break;
			}
			else{
				if(question_dict[i].satisfied == 0)
					promises.push(checkQuestion(question_dict[i].question));
				}
		}
		// for (var question in question_dict) {
	  //   promises.push(checkQuestion(question));
		// }
		// console.log("promises size:")
		// console.log(promises.size());
		if(promises.length == 0){
			res.send(question_dict+ "\nThat's all the information I needed. Crunching data for best deals!");
		}
		else{
		Promise.all(promises).then(function (results) {
			console.log("Promise results:");
    	console.log(results[results.length - 1]);
			promises.length = 0;
			var next = getNextQuestion();
			if(next == "done"){
				res.send(question_dict+ "\nThat's all the information I needed. Crunching data for best deals!");
			}
			else {
				var idx = getQuestionIndex(next);
				if(question_dict[idx].answer != '') {
					if(question_dict[idx].asked == 1){
						last_question_asked = next;
						next = "Sorry, I am not sure about: " + next + " Is this "+ question_dict[idx].answer +"? Reply with 'yes' or please answer the question again.";
					}
					else{
						fs.appendFile('passage.txt', question_dict[idx].prefix, function (err) {
				  		if (err) throw err;
				  			console.log('Saved!');
							});
						// var cmd = "echo -n \""+ question_dict[idx].prefix +"\" >> passage.txt";
						// console.log(cmd);
						// child = exec(cmd, function(error, stdout, stderr) {
					  // });
					}
				}
				question_dict[idx].asked = 1;
				res.send(next);
			}
	});
	}

	}

	app.post('/question', function(req, res){
		console.log(req.query.passage);
		if((req.query.passage).toLowerCase() == 'yes'){
			if(last_question_asked != "")
				update_question_dict(res, true);
			else
				res.send(getNextQuestion());
		}
		else{
		fs.appendFile('passage.txt', req.query.passage, function (err) {
  		if (err){
				throw err;
				res.send(getNextQuestion());
			}
			else{
  			console.log('Saved!');
				update_question_dict(res, false);
			}
			});
		}
		// var cmd = "echo -n \""+req.query.passage+"\" >> passage.txt";
		// console.log(cmd);
	  // child = exec(cmd, function(error, stdout, stderr) {
	  // });
		// child.on('exit', function() {
		//
		// });
	});

	app.listen(8080, function() {
  console.log('Server running at http://127.0.0.1:8080/');
	});
