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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
var fs = require('fs');
var https = require('https');
var crypto = require('crypto');

/**
 * Express
 */
var express = require('express');
var router = express.Router();

/**
 * Socket.io on 20123
 */
var http = require('http');
var server = http.createServer(module.exports.app = express());
var io = require('socket.io').listen(server.listen(20123));

/**
 * New rpc connection to 127.0.0.1:9195
 */
var rpc = require('node-json-rpc');
    rpc = new rpc.Client({port: 9195, host: '127.0.0.1', path: '/', strict: true});

/**
 * Cache
 */
var cache = {'settings':{'local_currency':'EUR', 'hidden':{}},
             'wallet_info':{'udp_connections':0},
             'currencies':{'vanilla':{'poloniex':0, 'bittrex':0, 'average':0},
                           'local':{'date':'', 'base':'', 'rates':{}}},
             'accounts':{},
             'watch_addresses':{},
             'trades':[],
             'nodes':{'connected':[], 'endpoints':[], 'geodata':{}},
             'transactions':{'log':[], 'edits':{}},
             'incentive_rewards':[{'block_number':284200, 'reward_percent':19},
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
                                  {'block_number':492000, 'reward_percent':37}]}

/**
 * 'filename':'cache-properties'
 */
var data_files = {'settings':'settings',
                  'transactions_edits':'transactions-edits',
                  'watch_addresses':'watch_addresses',
                  'currencies':'currencies',
                  'nodes_geodata':'nodes-geodata'}

/**
 * Create data/ directory if it doesn't exist
 */
if (!fs.existsSync('data')) {
    fs.mkdirSync('data');
}

/**
 * Read data files if they exist
 */
for (var filename in data_files) {
    var property = data_files[filename].split('-');

    (function(property, filename) {
        fs.stat('data/' + filename + '.json', function(error, stats) { 
            if (error) {
                /**
                 * Exit if error other than file not found
                 */
                if (error['code'] != 'ENOENT') {
                    console.log('FS data/' + filename + '.json ERROR\n\n', error);
                    return;
                }
            } else {
                if (stats['size'] != 0) {
                    fs.readFile('data/' + filename + '.json', function (error, data) {
                        if (error) {
                            console.log('FS.READ data/' + filename + '.json ERROR\n\n', error);
                            return;
                        }

                        if (property.length > 1) {
                            cache[property[0]][property[1]] = JSON.parse(data);
                        } else {
                            cache[property] = JSON.parse(data);
                        }
                    });
                }
            }
        });
    })(property, filename);
}

/**
 * On socket connection
 */
io.on('connection', function(socket) {
    /**
     * Update client with available currencies (for local currency select)
     */
    socket.emit('exchange_rates', cache['currencies']['local']['rates']);

    /**
     * Settings, set visibility of table with provided hash
     */
    socket.on('settings_hidden_set', function(hide) {
        cache['settings']['hidden'][hide['hash']] = hide['hidden'];

        fs.writeFile('data/settings.json', JSON.stringify(cache['settings'], null, 2), function(error) {
            if (error) {
                console.log('FS.WRITE data/settings.json (settings_hidden_set) ERROR\n\n', error);
                return;
            }
        });
    });

    /**
     * Encrypt wallet
     */
    socket.on('encryptwallet', function(key) {
        rpc.call({'jsonrpc':'2.0', 'method':'encryptwallet', 'params':[key], 'id':0}, function(error, response) {
            if (error || !response) {
                console.log('RPC encryptwallet ERROR\n\n', error);
                return;
            }

            socket.emit('alerts', 'Wallet successfuly encrypted. Restart your main Vanilla wallet.');
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
                                      'btc':cache['currencies']['local']['rates'][cache['settings']['local_currency']]['btc'],
                                      'vanilla_average':cache['currencies']['vanilla']['average']});

        fs.writeFile('data/settings.json', JSON.stringify(cache['settings'], null, 2), function(error) {
            if (error) {
                console.log('FS.WRITE data/settings.json (currency_change) ERROR\n\n', error);
                return;
            }
        });
    });

    /**
     * Send requested object
     */
    socket.on('cache_send', function(property) {
        var property = property.split('-');

        if (property.length > 1) {
            if (cache[property[0]].hasOwnProperty(property[1])) {
                socket.emit(property[0], cache[property[0]][property[1]]);
            }
        } else {
            if (cache.hasOwnProperty(property)) {
                if (property == 'watch_addresses') {
                    socket.emit(property, {'hidden':cache['settings']['hidden']['watchonly'], 'addresses':cache['watch_addresses']});
                } else {
                    socket.emit(property, cache[property]);
                }
            }
        }
    });

    /**
     * Re-send responses
     */
    socket.on('refresh', function() {
        CHECK_watchaddresses();
        RPC_listreceivedby();
        RPC_listsinceblock();
    });





    /**
     * <OVERHAUL>
     */

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

                RPC_listsinceblock();
            }
        }); 
    });

    /**
     * </OVERHAUL>
     */





    /**
     * Get new receiving address
     */
    socket.on('getnewaddress', function(account) {
        rpc.call({'jsonrpc':'2.0', 'method':'getnewaddress', 'params':[account], 'id':0}, function(error, response) {
            if (error || !response) {
                console.log('RPC getnewaddress ERROR\n\n', error);
                return;
            }

            RPC_listreceivedby();
        });
    });

    /**
     * Import a valid private key
     */
    socket.on('importprivkey', function(array) {
        var key = array[0];
        var account = array[1];

        rpc.call({'jsonrpc':'2.0', 'method':'importprivkey', 'params':[key, account], 'id':0}, function(error, response) {
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
                RPC_listreceivedby();
            }
        });
    });

    /**
     * Add new watch-only address
     */
    socket.on('addwatchaddress', function(array) {
        var address = array[0];
        var title = array[1];

        RPC_validateaddress(address, function(response, address) {
            /**
             * Check if the address is already added
             */
            var already_added = false;

            for (var i in cache['watch_addresses']) {
                if (i == address) {
                    already_added = true;
                    break;
                }
            }

            /**
             * Make sure address is valid, not yours & !already added
             */
            if (response['isvalid'] && !response['ismine'] && !already_added) {
                cache['watch_addresses'][address] = {'title':title};
                CHECK_watchaddresses();
            } else if (response['ismine']) {
                socket.emit('alerts', "The watch only address you've entered is already in your wallet.");
            } else if (already_added) {
                socket.emit('alerts', "The watch only address you've entered is already on the list.");
            } else {
                socket.emit('alerts', "The watch only address you've entered is not a valid address.");
            }
        }, address);
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
     * Dump transaction history to a .csv file
     */
    socket.on('dumptxhistory', function() {
        /**
         * Use createWriteStream in case of large tx history
         */
        var tx_history_csv = fs.createWriteStream('transaction_history.csv');

        tx_history_csv.on('error', function(error) {
            console.log('CSV dumptxhistory ERROR\n\n', error);
            return;
        });

        /**
         * Write column names
         */
        tx_history_csv.write('account, address, category, amount, confirmations, blockhash, blockindex, blocktime, txid, time, timereceived\n');

        for (var i in cache['transactions']['log']) {
            /**
             * Convert to miliseconds
             */
            var blocktime = new Date(cache['transactions']['log'][i]['blocktime'] * 1000);
                blocktime = blocktime.toLocaleDateString() + ' ' + blocktime.toLocaleTimeString();

            var time = new Date(cache['transactions']['log'][i]['time'] * 1000);
                time = time.toLocaleDateString() + ' ' + time.toLocaleTimeString();

            var timereceived = new Date(cache['transactions']['log'][i]['timereceived'] * 1000);
                timereceived = timereceived.toLocaleDateString() + ' ' + timereceived.toLocaleTimeString();

            /**
             * Write row
             */
            tx_history_csv.write(cache['transactions']['log'][i]['account'] + ', ' +
                                 cache['transactions']['log'][i]['address'] + ', ' +
                                 cache['transactions']['log'][i]['category'] + ', ' +
                                 cache['transactions']['log'][i]['amount'] + ', ' +
                                 cache['transactions']['log'][i]['confirmations'] + ', ' +
                                 cache['transactions']['log'][i]['blockhash'] + ', ' +
                                 cache['transactions']['log'][i]['blockindex'] + ', ' +
                                 blocktime + ', ' +
                                 cache['transactions']['log'][i]['txid'] + ', ' +
                                 time + ', ' + timereceived + '\n');
        }

        tx_history_csv.end();
        socket.emit('alerts', 'Transaction_history.csv successfuly dumped in your Vanilla WebUI directory.');
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
     * Check balances of watch-only addresses
     */
    function CHECK_watchaddresses() {
        var save = false;

        for (var i in cache['watch_addresses']) {
            HTTPS_getbalance(i, function(balance, address) {
                if (cache['watch_addresses'][address]['balance'] != balance) {
                    cache['watch_addresses'][address]['balance'] = balance;
                    save = true;
                }
            });
        }

        setTimeout(function() {
            /**
             * If there's no settings entry, display watch-only addresses
             */
            if (!cache['settings']['hidden'].hasOwnProperty('watchonly')) {
                cache['settings']['hidden']['watchonly'] = false;
            }

            socket.emit('watch_addresses', {'hidden':cache['settings']['hidden']['watchonly'], 'addresses':cache['watch_addresses']});

            if (save) {
                fs.writeFile('data/watch_addresses.json', JSON.stringify(cache['watch_addresses'], null, 2), function(error) {
                    if (error) {
                        console.log('FS.WRITE data/watch_addresses.json ERROR\n\n', error);
                        return;
                    }
                });
            }
        }, 1000);
    }

    /**
     * Get balance of provided address
     */
    function HTTPS_getbalance(address, callback) {
        https.get('https://blockchain.vanillacoin.net/ext/getbalance/' + address, function(response) {
            response.on('data', function(balance) {
                /**
                 * Make sure that the response is a valid float number
                 * Since NaN is the only JavaScript value that is treated as unequal to itself, you can always test if a value is NaN by checking it for equality to itself
                 */
                if (!(parseFloat(balance.toString('utf8')) !== parseFloat(balance.toString('utf8')))) {
                    var balance = JSON.parse(balance);

                    if (balance['error']) {
                        balance = 0;
                    }

                    callback(balance, address);
                }
            });
        }).on('error', function(error) {
            console.log('HTTPS https://blockchain.vanillacoin.net/ext/getbalance/' + address + ' ERROR\n\n', error);
            return;
        });
    }

    /**
     * Get location of provided IP
     */
    function HTTPS_getlocation(ip) {
        https.get('https://freegeoip.net/json/' + ip, function(response) {
            if (response['headers']['content-type'] == 'application/json') {
                var buffer = '';

                response.on('data', function(data) {
                    buffer += data;
                });

                response.on('end', function() {
                    var location_info = JSON.parse(buffer);

                    if (location_info) {
                        cache['nodes']['geodata'][ip] = {"lon":location_info['longitude'], "lat":location_info['latitude'], "country":location_info['country_name']};
                    }
                });
            }
        }).on('error', function(error) {
            console.log('HTTPS https://freegeoip.net/json/' + ip + ' ERROR\n\n', error);
            return;
        });
    }

    /**
     * RPC method 'validateaddress'
     */
    function RPC_validateaddress(address, callback, passalong) {
        rpc.call({'jsonrpc':'2.0', 'method':'validateaddress', 'params':[address], 'id':0}, function(error, response) {
            if (error || !response) {
                console.log('RPC validateaddress ERROR\n\n', error);
                return;
            }

            if (passalong) {
                callback(response['result'], passalong);
            } else {
                callback(response['result']);
            }
        });
    }

    /**
     * RPC method 'gettransaction'
     */
    function RPC_gettransaction(txid, callback) {
        rpc.call({'jsonrpc':'2.0', 'method':'gettransaction', 'params':[txid], 'id':0}, function(error, response) {
            if (error || !response) {
                console.log('RPC gettransaction ERROR\n\n', error);
                return;
            }

            callback(response['result'], txid);
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
     * Update account information
     */
    function RPC_listreceivedby() {
        rpc.call([{'jsonrpc':'2.0', 'method':'listreceivedbyaddress', 'params':{'minconf':1, 'includeempty':true}, 'id':0},
                  {'jsonrpc':'2.0', 'method':'listreceivedbyaccount', 'params':{'minconf':1, 'includeempty':true}, 'id':0}], function(error, response) {

            if (error || !response) {
                console.log('RPC listreceivedbyaddress && listreceivedbyaccount ERROR\n\n', error);
                return;
            }

            var byaddress = response[0]['result'];
            var byaccount = response[1]['result'];
            var accounts = {};

            /**
             * Set accounts
             */
            for (var i in byaccount) {
                var hash = crypto.createHash('md5').update(byaccount[i]['account']).digest('hex');
                var hidden = true;

                /**
                 * Correctly label empty "" (default) account
                 */
                if (!byaccount[i]['account']) {
                    byaccount[i]['account'] = 'Default';
                }

                /**
                 * If hash is found in settings, set visibility accordingly
                 */
                if (cache['settings']['hidden'].hasOwnProperty(hash)) {
                    hidden = cache['settings']['hidden'][hash];
                }

                /**
                 * If there's no settings entry, display Default account addresses
                 */
                if (!cache['settings']['hidden'].hasOwnProperty(hash) && byaccount[i]['account'] == 'Default') {
                    hidden = false;
                }

                accounts[hash] = {'account':byaccount[i]['account'], 'hidden':hidden, 'received':byaccount[i]['amount'], 'addresses':[]};
                cache['settings']['hidden'][hash] = hidden;
            }

            /**
             * Push addresses to accounts
             */
            for (var i in byaddress) {
                var hash = crypto.createHash('md5').update(byaddress[i]['account']).digest('hex');

                /**
                 * Correctly label empty "" (default) account
                 */
                if (!byaddress[i]['account']) {
                    byaddress[i]['account'] = 'Default';
                }

                accounts[hash]['addresses'].push({'address':byaddress[i]['address'], 'received':byaddress[i]['amount'], 'confirmations':byaddress[i]['confirmations']});
            }

            cache['accounts'] = accounts;
            socket.emit('accounts', cache['accounts']);
        });
    }

    /**
     * Update transactions
     */
    function RPC_listsinceblock() {
        rpc.call({'jsonrpc':'2.0', 'method':'listsinceblock', 'params':[], 'id':0}, function(error, response) {
            if (error || !response) {
                console.log('RPC listsinceblock ERROR\n\n', error);
                return;
            }

            var length_before = Object.keys(cache['transactions']['edits']).length;
            cache['transactions']['log'] = [];

            for (var i in response['result']['transactions']) {
                /**
                 * Correctly label empty "" (default) account
                 */
                if (!response['result']['transactions'][i]['account']) {
                    response['result']['transactions'][i]['account'] = 'Default';
                }

                /**
                 * Check if txid exists in transactions_edits
                 */
                if (cache['transactions']['edits'][response['result']['transactions'][i]['txid']]) {
                    /**
                     * Category generate & immature
                     */
                    if (response['result']['transactions'][i]['category'] == 'generate' || response['result']['transactions'][i]['category'] == 'immature') {
                        if (cache['transactions']['edits'][response['result']['transactions'][i]['txid']]['pos']) {
                            response['result']['transactions'][i]['pos'] = true;
                            response['result']['transactions'][i]['address'] = cache['transactions']['edits'][response['result']['transactions'][i]['txid']]['address'];
                            response['result']['transactions'][i]['amount'] = cache['transactions']['edits'][response['result']['transactions'][i]['txid']]['amount'];
                            response['result']['transactions'][i]['category'] = 'pos reward';
                        } else {
                            response['result']['transactions'][i]['pos'] = false;
                            response['result']['transactions'][i]['category'] = 'incentive reward';
                        }
                    }

                    /**
                     * Category receive
                     */
                    if (response['result']['transactions'][i]['category'] == 'receive') {
                        if (cache['transactions']['edits'][response['result']['transactions'][i]['txid']]['self-send']) {
                            response['result']['transactions'][i]['category'] = 'self-send';
                        }
                    }

                    /**
                     * Exclude sends to self, push everything else
                     */
                    if (!(response['result']['transactions'][i]['category'] == 'send' && cache['transactions']['edits'][response['result']['transactions'][i]['txid']]['self-send'])) {
                        cache['transactions']['log'].push(response['result']['transactions'][i]);
                    }
                } else {
                    /**
                     * Category generate & immature
                     */
                    if (response['result']['transactions'][i]['category'] == 'generate' || response['result']['transactions'][i]['category'] == 'immature') {

                        RPC_gettransaction(response['result']['transactions'][i]['txid'], function(response, txid) {
                            if (response['amount'] != 0) {
                                cache['transactions']['edits'][txid] = {'pos':true, 'address':response['vout'][1]['scriptPubKey']['addresses'][0], 'amount':response['amount']};
                            } else {
                                cache['transactions']['edits'][txid] = {'pos':false};
                            }
                        });
                    }

                    /**
                     * Category send -> self-send
                     */
                    var is_mine = false;

                    if (response['result']['transactions'][i]['category'] == 'send') {
                        RPC_validateaddress(response['result']['transactions'][i]['address'], function(address, txid) {
                            if (address['ismine']) {
                                is_mine = true;
                                cache['transactions']['edits'][txid] = {'self-send':true};
                            }
                        }, response['result']['transactions'][i]['txid']);
                    }

                    /**
                     * Exclude sends to self, push everything else
                     */
                    if (!is_mine) {
                        cache['transactions']['log'].push(response['result']['transactions'][i]);
                    }
                }
            }

            setTimeout(function() {
                if (Object.keys(cache['transactions']['edits']).length > length_before) {
                    fs.writeFile('data/transactions_edits.json', JSON.stringify(cache['transactions']['edits'], null, 2), function(error) {
                        if (error) {
                            console.log('FS.WRITE data/transactions_edits.json ERROR\n\n', error);
                            return;
                        }
                    });
                }
            }, 1000);

            socket.emit('transactions', cache['transactions']['log']);
        });
    }

    /**
     * Get foreign exchange rates published by the European Central Bank (base USD)
     */
    (function() {
        https.get('https://api.fixer.io/latest?base=USD', function(response) {
            if (response['headers']['content-type'] == 'application/json') {
                var buffer = '';

                response.on('data', function(data) {
                    buffer += data;
                });

                response.on('end', function() {
                    var exchange_rates = JSON.parse(buffer);

                    if (exchange_rates.hasOwnProperty('date') && exchange_rates.hasOwnProperty('base') && exchange_rates.hasOwnProperty('rates')) {
                        /**
                         * Check if response is newer
                         */
                        if (exchange_rates['date'] != cache['currencies']['local']['date']) {
                            cache['currencies']['local']['date'] = exchange_rates['date'];
                            cache['currencies']['local']['base'] = exchange_rates['base'];

                            for (var i in exchange_rates['rates']) {
                                cache['currencies']['local']['rates'][i] = {'rate':exchange_rates['rates'][i]};
                            }

                            /**
                             * Because USD is used as base set its rate to 1
                             */
                            cache['currencies']['local']['rates']['USD'] = {'rate':1};
                        }
                    }
                });
            }
        }).on('error', function(error) {
            console.log('HTTPS api.fixer.io/latest?base=USD ERROR\n\n', error);
            return;
        });
    })();

    /**
     * Update wallet info on initial client connection and repeat every 10 seconds
     */
    (function update() {
        rpc.call([{'jsonrpc':'2.0', 'method':'getinfo', 'params':[], 'id':0},
                  {'jsonrpc':'2.0', 'method':'getincentiveinfo', 'params':[], 'id':0}], function(error, response) {

            if (error || !response) {
                console.log('RPC getinfo && getincentiveinfo ERROR\n\n', error);
                return;
            }

            for (var i in response) {
                for (var j in response[i]['result']) {
                    if (j == 'version') {
                        cache['wallet_info'][j] = response[i]['result'][j].replace(':', ' ');
                    } else {
                        cache['wallet_info'][j] = response[i]['result'][j];
                    }
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
        rpc.call([{'jsonrpc':'2.0', 'method':'getpeerinfo', 'params':[], 'id':0},
                  {'jsonrpc':'2.0', 'method':'getnetworkinfo', 'params':[], 'id':0}], function(error, response) {

            if (error || !response) {
                console.log('RPC getpeerinfo && getnetworkinfo ERROR\n\n', error);
                return;
            }

            var getpeerinfo = response[0]['result'];
            var getnetworkinfo = response[1]['result'];
            var endpoints = [];
            var save = false;

            cache['wallet_info']['udp_connections'] = getnetworkinfo['udp']['connections'];

            for (var i in getpeerinfo) {
                /**
                 * Add clean subver with '/' & ':' removed
                 */
                if (getpeerinfo[i]['subver']) {
                    getpeerinfo[i]['subver_clean'] = getpeerinfo[i]['subver'].replace('/', '').replace('/', '').replace(':',' ');
                } else {
                    getpeerinfo[i]['subver_clean'] = 'No version response';
                }

                getpeerinfo[i]['group'] = 'Connected nodes';

                /**
                 * Check if there's geodata on IP, else request it
                 */
                var ip = getpeerinfo[i]['addr'].split(':')[0];

                if (cache['nodes']['geodata'][ip]) {
                    getpeerinfo[i]['lon'] = cache['nodes']['geodata'][ip]['lon'];
                    getpeerinfo[i]['lat'] = cache['nodes']['geodata'][ip]['lat'];
                    getpeerinfo[i]['country'] = cache['nodes']['geodata'][ip]['country'];
                } else {
                    HTTPS_getlocation(ip);
                    save = true;
                }
            }

            for (var i in getnetworkinfo['endpoints']) {
                /**
                 * Check if there's geodata on IP, else request it
                 */
                var ip = getnetworkinfo['endpoints'][i].split(':')[0];

                if (cache['nodes']['geodata'][ip]) {
                    endpoints.push({'addr':getnetworkinfo['endpoints'][i],
                                    'group':'Network endpoints',
                                    'lon':cache['nodes']['geodata'][ip]['lon'],
                                    'lat':cache['nodes']['geodata'][ip]['lat'],
                                    'country':cache['nodes']['geodata'][ip]['country']});
                } else {
                    HTTPS_getlocation(ip);
                    save = true;
                }
            }

            cache['nodes']['connected'] = getpeerinfo;
            cache['nodes']['endpoints'] = endpoints;

            /**
             * Both connected nodes & endpoints arrays have the same format, so we join them into one array used by the geomap
             */
            socket.emit('nodes_geomap', cache['nodes']['endpoints'].concat(cache['nodes']['connected']));
            socket.emit('nodes_connected', cache['nodes']['connected']);

            if (save) {
                setTimeout(function() {
                    fs.writeFile('data/nodes_geodata.json', JSON.stringify(cache['nodes']['geodata'], null, 2), function(error) {
                        if (error) {
                            console.log('FS.WRITE data/nodes_geodata.json ERROR\n\n', error);
                            return;
                        }
                    });
                }, 1000);
            }
        });

        setTimeout(update, 60000);
    })();

    /**
     * Update latest trades from Poloniex & Bittrex on initial client connection and repeat every 75 seconds
     */
    (function update() {
        var trades = [];

        https.get('https://poloniex.com/public?command=returnTradeHistory&currencyPair=BTC_VNL', function(response) {
            if (response['headers']['content-type'] == 'application/json') {
                var buffer = '';

                response.on('data', function(data) {
                    buffer += data;
                });

                response.on('end', function() {
                    var trade_history = JSON.parse(buffer);

                    if (trade_history != null) {
                        cache['currencies']['vanilla']['poloniex'] = parseFloat(trade_history[0]['rate']);

                        for (var i in trade_history) {
                            trades.push({'exchange':'poloniex',
                                         'date':trade_history[i]['date'],
                                         'type':trade_history[i]['type'],
                                         'vanilla_rate':trade_history[i]['rate'],
                                         'vanilla_amount':trade_history[i]['amount'],
                                         'btc_total':trade_history[i]['total']});
                        }
                    }
                });
            }
        }).on('error', function(error) {
            console.log('HTTPS poloniex.com/public?command=returnTradeHistory&currencyPair=BTC_VNL ERROR\n\n', error);
            return;
        });

        https.get('https://bittrex.com/api/v1.1/public/getmarkethistory?market=BTC-VNL&count=50', function(response) {
            if (response['headers']['content-type'] == 'application/json; charset=utf-8') {
                var buffer = '';

                response.on('data', function(data) {
                    buffer += data;
                });

                response.on('end', function() {
                    var trade_history = JSON.parse(buffer);

                    if (trade_history != null) {
                        if (trade_history.hasOwnProperty('result')) {
                            if (trade_history['result'].length != 0) {
                                cache['currencies']['vanilla']['bittrex'] = parseFloat(trade_history['result'][0]['Price']);

                                for (var i in trade_history['result']) {
                                    trades.push({'exchange':'bittrex',
                                                 'date':trade_history['result'][i]['TimeStamp'],
                                                 'type':trade_history['result'][i]['OrderType'],
                                                 'vanilla_rate':trade_history['result'][i]['Price'],
                                                 'vanilla_amount':trade_history['result'][i]['Quantity'],
                                                 'btc_total':trade_history['result'][i]['Total']});
                                }
                            }
                        }
                    }
                });
            }
        }).on('error', function(error) {
            console.log('HTTPS https://bittrex.com/api/v1.1/public/getmarkethistory?market=BTC-VNL&count=50 ERROR\n\n', error);
            return;
        });

        /**
         * Update average vanilla rate
         */
        setTimeout(function() {
            if (cache['currencies']['vanilla']['poloniex'] && cache['currencies']['vanilla']['bittrex']) {
                cache['currencies']['vanilla']['average'] = (cache['currencies']['vanilla']['poloniex'] + cache['currencies']['vanilla']['bittrex']) / 2;
            } else {
                cache['currencies']['vanilla']['average'] = cache['currencies']['vanilla']['poloniex'] + cache['currencies']['vanilla']['bittrex'];
            }

            /**
             * Don't update client on first run
             */
            if (Object.keys(cache['currencies']['local']['rates']).length != 0) {
                socket.emit('currency_info', {'code':cache['settings']['local_currency'],
                                              'btc':cache['currencies']['local']['rates'][cache['settings']['local_currency']]['btc'],
                                              'vanilla_average':cache['currencies']['vanilla']['average']});
            }
        }, 300);

        socket.emit('trades', cache['trades']);

        setTimeout(function() {
            if (trades.length != 0) {
                cache['trades'] = trades;
            }

            socket.emit('trades', cache['trades']);
        }, 3000);

        setTimeout(update, 75000);
    })();

    setTimeout(function() {
        /**
         * Update receivedby totals on initial client connection and repeat every 90 seconds
         */
        (function update() {
            RPC_listreceivedby();
            setTimeout(update, 90000);
        })();

        /**
         * Update transaction history on initial client connection and repeat every 2 minutes
         */
        (function update() {
            RPC_listsinceblock();
            setTimeout(update, 120000);
        })();

        /**
         * Update watch-only addresses on initial client connection and repeat every 15 minutes
         */
        (function update() {
            CHECK_watchaddresses();
            setTimeout(update, 900000);
        })();
    }, 300);

    /**
     * Update latest BTC prices on initial client connection and repeat every hour
     */
    (function update() {
        https.get('https://www.bitstamp.net/api/ticker_hour/', function(response) {
            if (response['headers']['content-type'] == 'application/json') {
                var buffer = '';

                response.on('data', function(data) {
                    buffer += data;
                });

                response.on('end', function() {
                    var ticker_hourly = JSON.parse(buffer);

                    if (ticker_hourly.hasOwnProperty('last')) {
                        setTimeout(function() {
                            /**
                             * Update BTC price for current rates
                             */
                            for (var i in cache['currencies']['local']['rates']) {
                                cache['currencies']['local']['rates'][i]['btc'] = cache['currencies']['local']['rates'][i]['rate'] * ticker_hourly['last'];
                            }

                            /**
                             * Save currencies to disk
                             */
                            fs.writeFile('data/currencies.json', JSON.stringify(cache['currencies'], null, 2), function(error) {
                                if (error) {
                                    console.log('FS.WRITE data/currencies.json ERROR\n\n', error);
                                    return;
                                }
                            });
                        }, 1000);
                    }
                });
            }
        }).on('error', function(error) {
            console.log('HTTPS www.bitstamp.net/api/ticker_hour/ ERROR\n\n', error);
            return;
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
