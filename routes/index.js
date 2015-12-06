/**
 * Copyright (C) 2015 whphhg
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version. For more information read the
 * complete license in LICENSE.md.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Express framework
 */
var express = require('express');
var router = express.Router();

/**
 * Start a new socket.io server listening on 20123
 */
var http = require('http');
var https = require('https');
var server = http.createServer(module.exports.app = express());
var io = require('socket.io').listen(server.listen(20123));

/**
 * Set port and host for RPC client
 */
var rpc = require('node-json-rpc');
    rpc = new rpc.Client({port: 9195, host: '127.0.0.1', path: '/', strict: true});

/**
 * Use nconf to load and update config.json
 */
var nconf = require('nconf').use('file', {file: './config.json'});
    nconf.load();

var extend = require('node.extend');
var request = require('request');

/**
 * On client connection
 */
io.on('connection', function(socket) {
    /**
     * Prepare cache
     */
    var cache = {'settings':nconf.get('settings'),
                 'vanilla_rates':nconf.get('vanilla_rates'),
                 'exchange_rates':nconf.get('exchange_rates'),
                 'watch_addresses':nconf.get('watch_addresses'),
                 'nodes_connected':[],
                 'nodes_network':[],
                 'nodes_geodata':{},
                 'wallet_info':{'udp_connections':0},
                 'listreceivedbyaddress':[],
                 'listsinceblock':[],
                 'incentive_rewards':[{'block_number':270000, 'reward_percent':17},
                                      {'block_number':276900, 'reward_percent':18},
                                      {'block_number':284200, 'reward_percent':19},
                                      {'block_number':292000, 'reward_percent':20},
                                      {'block_number':300200, 'reward_percent':21},
                                      {'block_number':308900, 'reward_percent':22},
                                      {'block_number':318000, 'reward_percent':23},
                                      {'block_number':327500, 'reward_percent':24},
                                      {'block_number':337500, 'reward_percent':25},
                                      {'block_number':347900, 'reward_percent':26},
                                      {'block_number':358800, 'reward_percent':27},
                                      {'block_number':370100, 'reward_percent':28},
                                      {'block_number':381900, 'reward_percent':29},
                                      {'block_number':394100, 'reward_percent':30},
                                      {'block_number':406800, 'reward_percent':31},
                                      {'block_number':419900, 'reward_percent':32},
                                      {'block_number':433400, 'reward_percent':33},
                                      {'block_number':447400, 'reward_percent':34},
                                      {'block_number':461800, 'reward_percent':35},
                                      {'block_number':476700, 'reward_percent':36},
                                      {'block_number':492000, 'reward_percent':37}]
    }

    /**
     * Update client with available currencies (for local currency select)
     */
    socket.emit('exchange_rates', cache['exchange_rates']['rates']);

    /**
     * Encrypt wallet
     */
    socket.on('encryptwallet', function(key) {
        rpc.call({'jsonrpc':'2.0', 'method':'encryptwallet', 'params':[key], 'id':0}, function(error, response) {
            if (error || !response) {
                console.log('RPC encryptwallet ERROR\n\n', error);
                return;
            }

            socket.emit('alerts', 'Wallet successfuly encrypted. Restart Vanilla wallet.');
        });
    });

    /**
     * Unlock wallet
     */
    socket.on('walletpassphrase', function(passphrase) {
        rpc.call({'jsonrpc':'2.0', 'method':'walletpassphrase', 'params':[passphrase], 'id':0}, function(error, response) {
            if (error || !response) {
                console.log('RPC walletpassphrase (unlock) ERROR\n\n', error);
                return;
            }

            if (response.hasOwnProperty('result')) {
                RPC_walletpassphrase();
            } else {
                socket.emit('alerts', "The passphrase you've entered is incorrect.");                
            }
        });
    });

    /**
     * Lock wallet
     */
    socket.on('walletlock', function() {
        rpc.call({'jsonrpc':'2.0', 'method':'walletlock', 'params':[], 'id':0}, function(error, response) {
            if (error || !response) {
                console.log('RPC walletlock ERROR\n\n', error);
                return;
            }

            RPC_walletpassphrase();
        });
    });

    /**
     * Update client and config with provided local currency
     */
    socket.on('currency_change', function(currency) {
        cache['settings']['local_currency'] = currency;
        socket.emit('currency_info', {'code':cache['settings']['local_currency'],
                                      'btc':cache['exchange_rates']['rates'][cache['settings']['local_currency']]['btc'],
                                      'vanilla_average':cache['vanilla_rates']['average']});

        nconf.set('settings:local_currency', cache['settings']['local_currency']);
        nconf.save(function(error) {
            if (error) {
                console.log('NCONF settings:local_currency ERROR\n\n', error['message']);
                return;
            }
        });
    });

    /**
     * Send requested cache
     */
    socket.on('cache_send', function(property) {
        if (cache.hasOwnProperty(property)) {
            socket.emit(property, cache[property]);
        }
    });

    /**
     * Refresh responses
     */
    socket.on('refresh', function() {
        HTTPS_getwatchaddresses();
        RPC_listreceivedbyaddress();
        RPC_listsinceblock();
    });













    /**
     * Check if the address is valid before transfering coins
     */
    socket.on('validateaddress', function(params) {
        var address = params[0];
        var amount = params[1];

        rpc.call({"jsonrpc": "2.0", "method": "validateaddress", "params": [address], "id": 0}, function(err, res) {
            if (err) { console.log(err); }

            if (res.result['isvalid']) {
                socket.emit('transfer_possible', [address, amount]);
            } else {
                socket.emit('alerts', "The address you're trying to send to is not valid.");
            }
        });
    });




    /**
     * Send amount to address
     */
    socket.on('sendtoaddress', function(params) {
        var address = params[0];
        var amount = params[1];

        rpc.call({"jsonrpc": "2.0", "method": "sendtoaddress", "params": [address, amount], "id": 0}, function(err, res) {
            if (err) { console.log(err); }

            if (res.error) {
                /**
                 * error_code_type_error = -3, NaN or negative
                 */
                if (res.error['code'] == -3) {
                    socket.emit('alerts', "You're trying to send an invalid amount (" + amount + ").");
                }
                /**
                 * error_code_wallet_error = -4, not enough funds
                 */
                else if (res.error['code'] == -4) {
                    socket.emit('alerts', "You have insufficient funds.");
                }
                /**
                 * error_code_wallet_unlock_needed = -13, wallet locked
                 */
                else if (res.error['code'] == -13) {
                    socket.emit('alerts', 'Wallet is locked. Unlock it if you want to transfer funds.');
                }
                /**
                 * error_code_amount_too_small = -101, amount too small
                 */
                else if (res.error['code'] == -101) {
                    socket.emit('alerts', 'Amount too small.');
                } else {
                    console.log(res.error);
                }
            } else {
                socket.emit('alerts', "Sent " + amount + " VNL to " + address + " (txid: " + res.result + ").");

                /**
                 * Update recent transaction list
                 */
                RPC_listsinceblock();
            }
        }); 
    });












    /**
     * Get new receiving address
     */
    socket.on('getnewaddress', function() {
        rpc.call({'jsonrpc':'2.0', 'method':'getnewaddress', 'params':[], 'id':0}, function(error, response) {
            if (error || !response) {
                console.log('RPC getnewaddress ERROR\n\n', error);
                return;
            }

            RPC_listreceivedbyaddress();
        });
    });

    /**
     * Import a valid private key
     */
    socket.on('importprivkey', function(key) {
        rpc.call({'jsonrpc':'2.0', 'method':'importprivkey', 'params':[key], 'id':0}, function(error, response) {
            if (error || !response) {
                console.log('RPC importprivkey ERROR\n\n', error);
                return;
            }

            if (response.hasOwnProperty('error')) {
                /**
                 * error_code_wallet_error = -4
                 */
                if (response['error']['code'] == -4) {
                    socket.emit('alerts', "The private key you're trying to import is already in your wallet.");
                }

                /**
                 * error_code_invalid_address_or_key = -5
                 */
                if (response['error']['code'] == -5) {
                    socket.emit('alerts', "The private key you're trying to import is invalid.");
                }
            } else {
                socket.emit('alerts', 'Private key successfully imported.');
                RPC_listreceivedbyaddress();
            }
        });
    });













    /**
     * Add new watch address object to config.json
     */
    socket.on('addwatchaddress', function(array) {
        var address = array[0];
        var title = array[1];

        rpc.call({"jsonrpc": "2.0", "method": "validateaddress", "params": [address], "id": 0}, function(err, res) {
            if (err) { console.log(err); }

            var already_added = false;

            /**
             * Check if the address is already saved
             */
            for (var i in cache['watch_addresses']) {
                if (cache['watch_addresses'][i]['address'] == address) {
                    already_added = true;
                    break;
                }
            }

            if (res.result['isvalid'] && !res.result['ismine'] && !already_added) {
                /**
                 * Add new watch address object to watchaddresses array
                 */
                cache['watch_addresses'].push({"address":address, "title":title});

                nconf.set('watch_addresses', cache['watch_addresses']);
                nconf.save(function(err) {
                    if (err) {
                        console.error(err.message);
                        return;
                    }
                });

                /**
                 * Update watch address list
                 */
                HTTPS_getwatchaddresses();
            } else if (res.result['ismine']) {
                socket.emit('alerts', "The watch only address you've entered is already in your wallet.");
            } else if (already_added) {
                socket.emit('alerts', "The watch only address you've entered is already on the list.");
            } else {
                socket.emit('alerts', "The watch only address you've entered is not a valid address.");
            }
        });
    });
















    /**
     * Retrieve incentive reward % based on provided block number
     */
    socket.on('incentive_reward', function(block_number) {
        for (var i in cache['incentive_rewards']) {
            if (block_number < cache['incentive_rewards'][i]['block_number']) {
                socket.emit('incentive_reward_response', cache['incentive_rewards'][i]['reward_percent'] - 1);
                break;
            }

            if (i == cache['incentive_rewards'].length - 1) {
                socket.emit('incentive_reward_response', cache['incentive_rewards'][i]['reward_percent']);
            }
        }
    });

    /**
     * Backup wallet
     */
    socket.on('backupwallet', function() {
        rpc.call({'jsonrpc':'2.0', 'method':'backupwallet', 'params':[""], 'id':0}, function(error, response) {
            if (error || !response) {
                console.log('RPC backupwallet ERROR\n\n', error);
                return;
            }

            if (response.hasOwnProperty('error')) {
                /**
                 * error_code_wallet_error = -4
                 */
                if (response['error']['code'] == -4) {
                    socket.emit('alerts', 'Backup failed.');
                }
            } else {
                socket.emit('alerts', 'Wallet successfuly backed up in your vanillacoind directory.');
            }
        });
    });

    /**
     * Check wallet
     */
    socket.on('checkwallet', function() {
        rpc.call({'jsonrpc':'2.0', 'method':'checkwallet', 'params':[], 'id':0}, function(error, response) {
            if (error || !response) {
                console.log('RPC checkwallet ERROR\n\n', error);
                return;
            }

            socket.emit('checkwallet_response', response['result']);
        });
    });

    /**
     * Repair wallet
     */
    socket.on('repairwallet', function() {
        rpc.call({'jsonrpc':'2.0', 'method':'repairwallet', 'params':[], 'id':0}, function(error, response) {
            if (error || !response) {
                console.log('RPC repairwallet ERROR\n\n', error);
                return;
            }

            socket.emit('repairwallet_response', response['result']);
        });
    });

    /**
     * Passphrase change
     */
    socket.on('walletpassphrasechange', function(passphrase) {
        rpc.call({'jsonrpc':'2.0', 'method':'walletpassphrasechange', 'params':[passphrase['old'], passphrase['new']], 'id':0}, function(error, response) {
            if (error || !response) {
                console.log('RPC walletpassphrasechange ERROR\n\n', error);
                return;
            }

            if (response.hasOwnProperty('error')) {
                /**
                 * error_code_wallet_passphrase_incorrect = -14
                 */
                if (response['error']['code'] == -14) {
                    socket.emit('alerts', "You've entered an incorrect current passphrase.");
                }

                /**
                 * error_code_wallet_wrong_enc_state = -15
                 */
                if (response['error']['code'] == -15) {
                    socket.emit('alerts', "Wallet is not encrypted.");
                }
            } else {
                socket.emit('alerts', 'Passphrase successfuly changed.');
            }
        });
    });

    /**
     * Dump private key
     */
    socket.on('dumpprivkey', function(key) {
        rpc.call({'jsonrpc':'2.0', 'method':'dumpprivkey', 'params':[key], 'id':0}, function(error, response) {
            if (error || !response) {
                console.log('RPC dumpprivkey ERROR\n\n', error);
                return;
            }

            if (response.hasOwnProperty('error')) {
                /**
                 * error_code_wallet_error = -4
                 */
                if (response['error']['code'] == -4) {
                    socket.emit('alerts', "The address you've entered does not belong to this wallet.");
                }

                /**
                 * error_code_invalid_address_or_key = -5
                 */
                if (response['error']['code'] == -5) {
                    socket.emit('alerts', "The address you've entered is invalid.");
                }
            } else {
                socket.emit('alerts', 'Private key: ' + response['result']);
            }
        });
    });

    /**
     * Dump wallet
     */
    socket.on('dumpwallet', function() {
        rpc.call({'jsonrpc':'2.0', 'method':'dumpwallet', 'params':[], 'id':0}, function(error, response) {
            if (error || !response) {
                console.log('RPC dumpwallet ERROR\n\n', error);
                return;
            }

            socket.emit('alerts', 'Wallet.csv successfuly dumped in your .Vanillacoin/data directory.');
        });
    });











    /**
     * Get and set balances then emit the updated array
     */
    function HTTPS_getwatchaddresses() {
        /**
         * Set balance for the provided address
         */
        function setBalance(address) {
            for (key in cache['watch_addresses']) {
                if (cache['watch_addresses'][key]['address'] == address) {
                    cache['watch_addresses'][key]['balance'] = balance;
                    break;
                }
            }
        }

        /**
         * Get balance of the provided address
         */
        function getBalance(address) {
            var request = https.get('https://blockchain.vanillacoin.net/ext/getbalance/$address'.replace('$address', address), function(res) {
                res.on('data', function(obj) {
                    /**
                     * Make sure that the response is a valid float number
                     * Since NaN is the only JavaScript value that is treated as unequal to itself, you can always test if a value is NaN by checking it for equality to itself
                     */
                    if (!(parseFloat(obj.toString('utf8')) !== parseFloat(obj.toString('utf8')))) {
                        parsedObj = JSON.parse(obj);

                        if (parsedObj.error) {
                            balance = 0;
                        } else {
                            balance = parsedObj;
                        }

                        setBalance(address);
                    }
                });
            });

            request.on('error', function(err) {
                console.log('ERR getBalance', err);
            });
        }

        for (key in cache['watch_addresses']) {
            if (!cache['watch_addresses'][key].hasOwnProperty('balance')) {
                cache['watch_addresses'][key]['balance'] = 'Updating...';
            }

            getBalance(cache['watch_addresses'][key]['address']);
        }

        /**
         * Emit the array with 'Updating...' as balances on first load
         */
        socket.emit('watch_addresses', cache['watch_addresses']);

        /**
         * Emit it again after 1 second when balances (should) update. Increase this timeout if you've added a lot of watch-only addresses
         */
        setTimeout(function() {
            socket.emit('watch_addresses', cache['watch_addresses']);
        }, 1000);
    }

    /**
     * Update watch address data when a client connects and after that every 15 minutes
     */
    (function update() {
        HTTPS_getwatchaddresses();

        setTimeout(update, 900000);
    })();









    /**
     * Get lon, lat & country for provided IP and update nodes_geodata
     */
    function HTTPS_freegeoip(ip) {
        /**
         * http://ip-api.com/json/_IP_ (was more accurate, but is http only)
         */
        request('https://freegeoip.net/json/$ip'.replace('$ip', ip), function(error, response, body) {
            if (!response) { return; }
            if (!error) {
                /**
                 * Make sure that response content-type is JSON
                 */
                if (response['headers']['content-type'] == 'application/json') {
                    body = JSON.parse(body);

                    /**
                     * body will evalute to true if value is not: null, undefined, NaN, empty string (""), 0, false
                     */
                    if (body) {
                        cache['nodes_geodata'][ip] = {"lon":body['longitude'], "lat":body['latitude'], "country":body['country_name']};
                    }
                } else {
                    console.log('HTTPS_freegeoip() incorrect response content-type. Headers: ', response['headers']);
                }
            } else {
                console.log('HTTPS_freegeoip()', error);
            }
        });
    }



















    /**
     * RPC method 'walletpassphrase'
     * Used on client to update wallet state (locked / unlocked / unencrypted) using provided error code
     */
    RPC_walletpassphrase();

    function RPC_walletpassphrase() {
        rpc.call({'jsonrpc':'2.0', 'method':'walletpassphrase', 'params':[], 'id':0}, function(error, response) {
            if (error || !response) {
                console.log('RPC walletpassphrase (state check) ERROR\n\n', error);
                return;
            }

            socket.emit('wallet_status', response['error']);
        });
    }

    /**
     * RPC method 'listreceivedbyaddress'
     */
    function RPC_listreceivedbyaddress() {
        rpc.call({'jsonrpc':'2.0', 'method':'listreceivedbyaddress', 'params':{'minconf':1, 'includeempty':true}, 'id':0}, function(error, response) {
            if (error || !response) {
                console.log('RPC listreceivedbyaddress ERROR\n\n', error);
                return;
            }

            cache['listreceivedbyaddress'] = response['result'];
            socket.emit('listreceivedbyaddress', cache['listreceivedbyaddress']);
        });
    }

    /**
     * RPC method 'listsinceblock
     */
    function RPC_listsinceblock() {
        rpc.call({'jsonrpc':'2.0', 'method':'listsinceblock', 'params':[], 'id':0}, function(error, response) {
            if (error || !response) {
                console.log('RPC listsinceblock ERROR\n\n', error);
                return;
            }

            cache['listsinceblock'] = response['result']['transactions'];
            socket.emit('listsinceblock', cache['listsinceblock']);
        });
    }

    /**
     * Get foreign exchange rates published by the European Central Bank (base USD)
     */
    (function() {
        request('https://api.fixer.io/latest?base=USD', function(error, response, body) {
            if (error || !response) {
                console.log('HTTPS api.fixer.io/latest?base=USD ERROR\n\n', error);
                return;
            }

            if (response['headers']['content-type'] == 'application/json') {
                var body = JSON.parse(body);

                if (body.hasOwnProperty('date') && body.hasOwnProperty('base') && body.hasOwnProperty('rates')) {
                    /**
                     * Check if response is newer than the one in config
                     */
                    if (body['date'] != cache['exchange_rates']['date']) {
                        cache['exchange_rates']['date'] = body['date'];
                        cache['exchange_rates']['base'] = body['base'];

                        for (var i in body['rates']) {
                            cache['exchange_rates']['rates'][i] = {'rate':body['rates'][i]};
                        }

                        /**
                         * Because USD is used as base set its rate to 1
                         */
                        cache['exchange_rates']['rates']['USD'] = {'rate':1};
                    }
                }
            }
        });
    })();

    /**
     * Update wallet info on initial client connection and repeat every 10 seconds
     */
    (function update() {
        rpc.call([{'jsonrpc':'2.0', 'method':'getinfo', 'params':[], 'id':0}, {'jsonrpc':'2.0', 'method':'getincentiveinfo', 'params':[], 'id':0}], function(error, response) {
            if (error || !response) {
                console.log('RPC getinfo && getincentiveinfo ERROR\n\n', error);
                return;
            }

            for (var i in response) {
                for (var j in response[i]['result']) {
                    cache['wallet_info'][j] = response[i]['result'][j];
                }
            }

            socket.emit('wallet_info', cache['wallet_info']);
        });

        setTimeout(update, 10000);
    })();

    /**
     * Update nodes info on initial client connection and repeat every 60 seconds
     */
    (function update() {
        rpc.call([{'jsonrpc':'2.0', 'method':'getpeerinfo', 'params':[], 'id':0}, {'jsonrpc':'2.0', 'method':'getnetworkinfo', 'params':[], 'id':0}], function(error, response) {
            if (error || !response) {
                console.log('RPC getpeerinfo && getnetworkinfo ERROR\n\n', error);
                return;
            }

            var getpeerinfo = response[0]['result'];
            var getnetworkinfo = response[1]['result'];

            /**
             * Update udp connection count
             */
            cache['wallet_info']['udp_connections'] = getnetworkinfo['udp']['connections'];

            /**
             * TODO: Add radio button to geomap controls: Whole network / Connected nodes
             */
            cache['nodes_network'] = getnetworkinfo['endpoints'];

            /**
             * Sort getpeerinfo by subver, descending order
             */
            getpeerinfo.sort(function(a,b) {
                return a['subver'] < b['subver'];
            });

            /**
             * Deep copy getpeerinfo to avoid altering the original with deletes
             */
            var getpeerinfo_copy = extend(true, [], getpeerinfo);

            for (var i in getpeerinfo) {
                /**
                 * Check if address exists in previous result and if it has lon/lat
                 */
                for (var j in cache['nodes_connected']) {
                    if (getpeerinfo[i]['addr'] == cache['nodes_connected'][j]['addr'] && cache['nodes_connected'][j]['lon'] && cache['nodes_connected'][j]['lat']) {
                        delete getpeerinfo_copy[i];
                        break;
                    }
                }

                /**
                 * Add clean subver with '/' & ':' removed
                 */
                if (getpeerinfo[i]['subver']) {
                    getpeerinfo[i]['subver_clean'] = getpeerinfo[i]['subver'].replace('/', '').replace('/', '').replace(':',' ');
                } else {
                    getpeerinfo[i]['subver_clean'] = 'No version';
                }

                /**
                 * Check if there's geodata on IP, else request it
                 */
                var ip = getpeerinfo[i]['addr'].split(':')[0];

                if (cache['nodes_geodata'][ip]) {
                    getpeerinfo[i]['lon'] = cache['nodes_geodata'][ip]['lon'];
                    getpeerinfo[i]['lat'] = cache['nodes_geodata'][ip]['lat'];
                    getpeerinfo[i]['country'] = cache['nodes_geodata'][ip]['country'];
                } else {
                    HTTPS_freegeoip(ip);
                }
            }

            /**
             * Check if getpeerinfo results differ
             */
            if (getpeerinfo_copy.length != 0) {
                cache['nodes_connected'] = getpeerinfo;
                socket.emit('nodes_geomap', cache['nodes_connected']);
            }

            socket.emit('nodes_connected', getpeerinfo);
        });

        setTimeout(update, 60000);
    })();

    /**
     * Update latest trades from Poloniex & Bittrex on initial client connection and repeat every 75 seconds
     */
    (function update() {
        request('https://poloniex.com/public?command=returnTradeHistory&currencyPair=BTC_VNL', function(error, response, body) {
            if (error || !response) {
                console.log('HTTPS poloniex.com/public?command=returnTradeHistory&currencyPair=BTC_VNL ERROR\n\n', error);
                return;
            }

            if (response['headers']['content-type'] == 'application/json') {
                var body = JSON.parse(body);

                if (body.length > 1) {
                    cache['vanilla_rates']['poloniex'] = parseFloat(body[0]['rate']);
                    socket.emit('trades_poloniex', body);
                }
            }
        });

        request('https://bittrex.com/api/v1.1/public/getmarkethistory?market=BTC-VNL&count=50', function(error, response, body) {
            if (error || !response) {
                console.log('HTTPS https://bittrex.com/api/v1.1/public/getmarkethistory?market=BTC-VNL&count=50 ERROR\n\n', error);
                return;
            }

            if (response['headers']['content-type'] == 'application/json; charset=utf-8') {
                var body = JSON.parse(body);

                if (body['result'].length > 1) {
                    cache['vanilla_rates']['bittrex'] = parseFloat(body['result'][0]['Price']);
                    socket.emit('trades_bittrex', body['result']);
                }
            }
        });

        /**
         * Update average vanilla rate
         */
        setTimeout(function() {
            if (cache['vanilla_rates']['poloniex'] && cache['vanilla_rates']['bittrex']) {
                cache['vanilla_rates']['average'] = (cache['vanilla_rates']['poloniex'] + cache['vanilla_rates']['bittrex']) / 2;
            } else {
                cache['vanilla_rates']['average'] = cache['vanilla_rates']['poloniex'] + cache['vanilla_rates']['bittrex'];
            }

            /**
             * Don't update client on first run
             */
            if (Object.keys(cache['exchange_rates']['rates']).length != 0) {
                socket.emit('currency_info', {'code':cache['settings']['local_currency'],
                                              'btc':cache['exchange_rates']['rates'][cache['settings']['local_currency']]['btc'],
                                              'vanilla_average':cache['vanilla_rates']['average']});
            }
        }, 300);

        setTimeout(update, 75000);
    })();

    setTimeout(function() {
        /**
         * Update received by address totals on initial client connection and repeat every 90 seconds
         */
        (function update() {
            RPC_listreceivedbyaddress();
            setTimeout(update, 90000);
        })();

        /**
         * Update transaction history on initial client connection and repeat every 120 seconds
         */
        (function update() {
            RPC_listsinceblock();
            setTimeout(update, 120000);
        })();
    }, 300);

    /**
     * Update latest BTC prices on initial client connection and repeat every hour
     */
    (function update() {
        request('https://www.bitstamp.net/api/ticker_hour/', function(error, response, body) {
            if (error || !response) {
                console.log('HTTPS www.bitstamp.net/api/ticker_hour/ ERROR\n\n', error);
                return;
            }

            if (response['headers']['content-type'] == 'application/json') {
                var body = JSON.parse(body);

                if (body.hasOwnProperty('last')) {
                    setTimeout(function() {
                        /**
                         * Update BTC price for current rates
                         */
                        for (var i in cache['exchange_rates']['rates']) {
                            cache['exchange_rates']['rates'][i]['btc'] = cache['exchange_rates']['rates'][i]['rate'] * body['last'];
                        }

                        /**
                         * Save updated exchange & vanilla rates to config
                         */
                        nconf.set('exchange_rates', cache['exchange_rates']);
                        nconf.set('vanilla_rates', cache['vanilla_rates']);
                        nconf.save(function(error) {
                            if (error) {
                                console.log('NCONF exchange_rates && vanilla_rates ERROR\n\n', error['message']);
                                return;
                            }
                        });
                    }, 1000);
                }
            }
        });

        setTimeout(update, 3600000);
    })();
});

/**
 * GET root page
 */
router.get('/', function(req, res, next) {
    res.render('index', {title: 'Vanilla WebUI'});
});

module.exports = router;
