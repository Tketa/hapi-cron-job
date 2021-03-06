'use strict';
const Package = require('./package');
const Joi = require('joi');
const cl = console.log;

const internals = {
    jobsArrayScheme: Joi.array({
        name: Joi.string(),
        enabled: Joi.boolean(),
        schedule: Joi.string(),
        execute: Joi.func(),
        enabledCallback: Joi.func().optional(),
        immediate: Joi.boolean().optional(),
        environments: Joi.array(Joi.string()).optional()
    }),
    optionsScheme: Joi.object({
        jobs: Joi.array().items(),
        localTime: Joi.boolean().optional(),
        callback: Joi.func().optional()
    })
};

var date = new Date();
var unixTime = Math.floor(new Date().getTime() / 1000);

var config = {
    timezone: "local"
};
var getTimeData = function (timezone) {
    if (!timezone) {
        timezone = config.timezone || 'local';
    }
    var date = new Date();
    if (timezone == "local") {
        return {
            time: date.toLocaleTimeString('en-US', { hour12: false }),
            date: date.toLocaleDateString(),
            datetime: date.toLocaleString(),
            UTCEpochMS: date.getTime(),
            UTCEpoch: Math.floor(date.getTime() / 1000),
            localEpochMS: date.getTime() + (date.getTimezoneOffset() * 60000),
            localEpoch: Math.floor((date.getTime() + (date.getTimezoneOffset() * 60)) / 1000)
        }
    } else if (timezone == "GMT") {
        return {
            time: date.toISOString().substr(11, 8),
            date: date.toISOString().substr(0, 10),
            datetime: date.toISOString().substr(0, 10) + ' ' + date.toISOString().substr(11, 8),
            UTCEpochMS: date.getTime(),
            UTCEpoch: Math.floor(date.getTime() / 1000),
            localEpochMS: date.getTime(),
            localEpoch: Math.floor(date.getTime() / 1000)
        }
    } else {
        throw new Error('ISSUE ON TIMEZONE PARAMS');
    }
};

const MAX_INT_32 = 2147483647;
const PERIODS = {
    leap_year: 31622400,
    year: 31536000,
    month: 262800,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
    second: 1
    
};
const TYPES = {
    //
    every: /^every\b/,
    at: /^(at|@)\b/,
    //
    second: /^(s|sec(ond)?(s)?)\b/,
    minute: /^(m|min(ute)?(s)?)\b/,
    hour: /^(h(our)?(s)?)\b/,
    day: /^(d(ay)?(s)?)\b/,
    week: /^(w(eek)?(s)?)\b/,
    //
    clockTime: /^(([0]?[1-9]|1[0-2]):[0-5]\d(\s)?(am|pm))\b/,
    fullTime: /^(([0]?\d|[1]\d|2[0-3]):([0-5]\d))\b/,
    anyNumber: /^([0-9]+)\b/,
    plain: /^((plain))\b/,
};
const _parseText = function (string) {
    function testMultiple(expr, testArr) {
        for (var i = 0; i < testArr.length; i++) {
            if (testArr[i].test(expr)) {
                return true;
            }
        }
    }
    
    function parseExpression(str) {
        var error = 0;
        var firstExecSecRemaining = null,
            nextExecSecRemaining = null,
            intervalInSec = PERIODS.day;//Seconds in a Day
        
        var splitText = str.split(' ');
        if (splitText.length > 3 || splitText.length < 2) {
            error = 1;//Date is not valid
        } else {
            if (TYPES['every'].test(splitText[0])) {
                // cl(TYPES['clockTime'].test(splitText[1]));
                
                if (!testMultiple(splitText[2],
                        [
                            TYPES['second'],
                            TYPES['minute'],
                            TYPES['hour'],
                            TYPES['day'],
                            TYPES['week']
                        ])) {
                    error = 3;//This is a wrong syntax
                }
                else if (!TYPES['anyNumber'].test(splitText[1])) {
                    if (TYPES['plain'].test(splitText[1])) {
                        var DETERMINED_TYPE = undefined;
                        if (TYPES['minute'].test(splitText[2])) DETERMINED_TYPE = 'm';
                        if (TYPES['hour'].test(splitText[2])) DETERMINED_TYPE = 'h';
                        if (TYPES['day'].test(splitText[2])) DETERMINED_TYPE = 'd';
                        
                        var now, fullTime, nowSeconds, nowMinute, nowHour;
                        switch (DETERMINED_TYPE) {
                            case 'm':
                                var m = PERIODS.minute;
                                now = new Date();
                                fullTime = now.toTimeString().substr(0, 8);
                                nowSeconds = Number(fullTime.substr(6, 2));
                                firstExecSecRemaining = (PERIODS.minute - nowSeconds);//Get the diff between now and our period
                                nextExecSecRemaining = ((2 * PERIODS.minute) - nowSeconds);
                                intervalInSec = m;
                                break;
                            case 'h':
                                var h = PERIODS.hour;
                                now = new Date();
                                fullTime = now.toTimeString().substr(0, 8);
                                nowSeconds = Number(fullTime.substr(6, 2));
                                nowMinute = Number(fullTime.substr(3, 2));
                                nowHour = Number(fullTime.substr(0, 2));
                                
                                firstExecSecRemaining = (PERIODS.hour - (nowMinute * PERIODS.minute)) - (nowSeconds);//Get the diff between now and our period
                                nextExecSecRemaining = (2 * PERIODS.hour - (nowMinute * PERIODS.minute)) - (nowSeconds);
                                intervalInSec = h;
                                break;
                            default:
                                throw Error("Duh, that's an error in testing types allowed");
                                break;
                            
                        }
                    } else {
                        error = 4;//This is not a valid number
                    }
                }
                else {
                    var DETERMINED_TYPE = undefined;
                    if (TYPES['second'].test(splitText[2])) DETERMINED_TYPE = 's';
                    if (TYPES['minute'].test(splitText[2])) DETERMINED_TYPE = 'm';
                    if (TYPES['hour'].test(splitText[2])) DETERMINED_TYPE = 'h';
                    if (TYPES['day'].test(splitText[2])) DETERMINED_TYPE = 'd';
                    if (TYPES['week'].test(splitText[2])) DETERMINED_TYPE = 'w';
                    
                    switch (DETERMINED_TYPE) {
                        case 's':
                            var s = Number(splitText[1]) * PERIODS.second;
                            firstExecSecRemaining = s;
                            nextExecSecRemaining = s + firstExecSecRemaining;
                            intervalInSec = s;
                            break;
                        case 'm':
                            var m = Number(splitText[1]) * PERIODS.minute;
                            firstExecSecRemaining = m;
                            nextExecSecRemaining = m + firstExecSecRemaining;
                            intervalInSec = m;
                            break;
                        case 'h':
                            var h = Number(splitText[1]) * PERIODS.hour;
                            firstExecSecRemaining = h;
                            nextExecSecRemaining = h + firstExecSecRemaining;
                            intervalInSec = h;
                            break;
                        case 'd':
                            var d = Number(splitText[1]) * PERIODS.day;
                            firstExecSecRemaining = d;
                            nextExecSecRemaining = d + firstExecSecRemaining;
                            intervalInSec = d;
                            break;
                        case 'w':
                            var w = Number(splitText[1]) * PERIODS.week;
                            firstExecSecRemaining = w;
                            nextExecSecRemaining = w + firstExecSecRemaining;
                            intervalInSec = w;
                            break;
                        default:
                            throw Error("Duh, that's an error in testing types allowed");
                            break;
                        
                    }
                }
            }
            var handleAt = function () {
                var time = null;
                
                if (!TYPES['clockTime'].test(splitText[1] + ' ' + splitText[2])) {
                    if (TYPES['fullTime'].test(splitText[1])) {
                        time = splitText[1]+':'+'00';
                    } else {
                        error = 2;//This is a wrong time (we expected a 12 hour clock time with a am/pm ending or a 24hr clock)
                        return false;
                    }
                } else {
                    if (splitText[2] == "am") {
                        time = (splitText[1].length != 5) ? "0" + splitText[1] : splitText[1];
                    }
                    if (splitText[2] == "pm") {
                        var h = (Number((splitText[1]).split(':')[0]) + 12).toString();
                        var m = (splitText[1]).split(':')[1];
                        time = h + ":" + m+':'+'00';
                    }
                }
                if (!time) {
                    error = 5; //Issue
                    return false;
                }
                
                var diff = {
                    s:0,
                    m:0,
                    h:0,
                    d:0
                };
                var actualTime = getTimeData().time;
                diff.h = time.substr(0,2)-actualTime.substr(0,2);
                diff.m = time.substr(3,2)-actualTime.substr(3,2);
                diff.s = time.substr(6,2)-actualTime.substr(6,2);
                
                diff = diff.s+diff.m*PERIODS.minute+diff.h*PERIODS.hour;
                if(diff<0){
                    diff = diff+PERIODS.day;
                }
                
                firstExecSecRemaining = diff;
                nextExecSecRemaining = diff + PERIODS.day;
                intervalInSec = PERIODS.day;
                
            };
            if (TYPES['at'].test(splitText[0])) {
                handleAt();
            }
            
        }
        if (!firstExecSecRemaining || !nextExecSecRemaining || !intervalInSec || error !== 0) {
            throw new Error('There is an error in parsingExpression, err:' + error);
        }
        return {
            firstExec: firstExecSecRemaining,
            nextExec: nextExecSecRemaining,
            intervalInSec: intervalInSec,
            error: error
        }
        
    }
    
    return parseExpression(string.toLowerCase());
};
const _setTimeout = function (fn, second) {
    if (second > MAX_INT_32) {
        console.error("Couldn't execute Function. Max allowable value for setTimeout has to be no more than 2147483648 (Int32).")
    } else {
        setTimeout(fn, second);
    }
};

const _setInterval = function (fn, sched) {
    if (!fn || !sched) {
        return false;
    }
    if (sched.hasOwnProperty('firstExec')) {
        _setTimeout(fn, sched.firstExec * 1000);
    }
    if (sched.hasOwnProperty('nextExec')) {
        _setTimeout(fn, sched.nextExec * 1000);
    }
    if (sched.hasOwnProperty('intervalInSec')) {
        var intervaledFn = function () {
            fn();
            _setTimeout(intervaledFn, sched.intervalInSec * 1000);
        };
        _setTimeout(intervaledFn, (sched.nextExec + sched.intervalInSec) * 1000);
    }
    return true;
};

exports.register = function (server, options, next) {
    var validateOptions = internals.optionsScheme.validate(options);
    var validateJobs = internals.jobsArrayScheme.validate(options.jobs);
    if (validateOptions.error) {
        return next(validateOptions.error);
    }
    if (validateJobs.error) {
        return next(validateJobs.error);
    }
    if (options.hasOwnProperty('localTime') && options.localTime === false) {
        config.timezone = "GMT";
    }
    
    var enabledJobs = [];
    var len = options.jobs.length;
    while (len--) {
        var job = options.jobs[len];
        //If we enabled the job
        if (job.enabled) {
            //If we ask to start on our environment, but we aren't in this env, skip it
            if (job.environments && job.environments.indexOf(process.env.NODE_ENV) == -1) {
                console.error(job.name + " has been skipped as env asked are", job.environments, 'and actual process.env.NODE_ENV is', process.env.NODE_ENV + '.');
                continue;
            }
            enabledJobs.push(job);
            var textSchedule = job.schedule;
            var scheduleParsed = (_parseText(textSchedule));
            if (scheduleParsed && scheduleParsed.firstExec && scheduleParsed.nextExec && scheduleParsed.intervalInSec) {
                var fnToExec = job.execute;
                _setInterval(fnToExec, scheduleParsed);
                
                //We want this to be before immediate execute
                if (job.hasOwnProperty('enabledCallback')) {
                    job.enabledCallback(job, scheduleParsed);
                }
                if (job.hasOwnProperty('immediate') && job.immediate) {
                    _setTimeout(fnToExec, 0);
                }
                
            } else {
                var debugErr = {
                    message: "Issue on parseText",
                    isScheduleParsed: !!scheduleParsed,
                    isFirstExec: !!scheduleParsed.firstExec,
                    isNextExec: !!scheduleParsed.nextExec,
                    isIntervalInSec: !!scheduleParsed.intervalInSec
                };
                console.error(debugErr);
            }
        }
    }
    if (options.hasOwnProperty('callback')) {
        options.callback(enabledJobs);
    }
    return next();
};
exports._parseText = _parseText;
exports.register.attributes = {
    name: Package.name,
    version: Package.version
};
