import {
    defineWidget,
    log,
    runCallback,
    getData,
    execute,
} from 'widget-base-helpers';

import $ from 'jquery';
import jQuery from 'jquery';
import 'jquery-ui';
import 'tag-it/js/tag-it';

import {
    create as createElement,
    place as placeElement,
    destroy as destroyElement,
} from 'dojo/dom-construct';

import {
    contains as containsClass,
} from 'dojo/dom-class';

import {
    set as setStyle,
} from 'dojo/dom-style';

import {
    forEach,
} from 'dojo/_base/array';

import template from './LabelSelect.template.html';

// Styling
import 'jquery-ui-dist/jquery-ui.min.css';
import 'jquery-ui-dist/jquery-ui.theme.min.css';
import 'tag-it/css/jquery.tagit.css';
import './LabelSelect.scss';

/* develblock:start */
import loadcss from 'loadcss';
loadcss(`/widgets/LabelSelect/widget/ui/LabelSelect.css`);
/* develblock:end */

console.log($);

export default defineWidget('LabelSelect', template, {

    // Set in modeler
    tagAssoc: '',
    tagAttrib: '',
    colorAttrib: '',
    sortAttr: '',
    sortOrder: '',
    tagConstraint: '',
    aftercreatemf: '',
    onchangemf: '',
    enableCreate: true,
    readOnly: false,
    showAutoCompleteOnFocus: false,
    saveOnAddTag: true,
    tagLimit: 0,
    autocompleteMinLength: 0,

    // Internal
    _contextObj: null,
    _listBox: null,
    _tagEntity: null,
    _tagAttribute: null,
    _colorAttribute: null,
    _refAttribute: null,
    _tagCache: null,
    _readOnly: false,
    _constructed: false,

    _jQ: jQuery,

    constructor() {
        this.log = log.bind(this);
        this.runCallback = runCallback.bind(this);
        this._getData = getData.bind(this);
        this._execMf = execute.bind(this);
    },

    postCreate() {
        this.log('postCreate', this._WIDGET_VERSION);

        this._tagEntity = this.tagAssoc.split('/')[ 1 ];
        this._refAttribute = this.tagAssoc.split('/')[ 0 ];
        this._tagAttribute = this.tagAttrib.split('/')[ 2 ];
        this._colorAttribute = this.colorAttrib.split('/')[ 2 ];
        this._tagCache = {}; //we need this to set references easily.

        this._readOnly = this.readOnly || this.get('disabled') || this.readonly;
    },

    update(obj, callback) {
        this.log('update');

        if (!this._constructed) {
            this._listBox = createElement('ul', {
                id: this.id + '_listBox',
            });
            placeElement(this._listBox, this.domNode);
            this._constructed = true;
        }

        if (obj) {
            setStyle(this.domNode, 'visibility', 'visibility');
            this._contextObj = obj;
            this._fetchCurrentLabels(callback);
            this._resetSubscriptions();
        } else {
            setStyle(this.domNode, 'visibility', 'hidden');
            this.runCallback(callback, 'update');
        }
    },

    async _fetchCurrentLabels(callback) {
        this.log('_fetchCurrentLabels');
        const xpath = '//' + this._tagEntity + this.tagConstraint.replace(/\[\%CurrentObject\%\]/gi, this._contextObj.getGuid()); // eslint-disable-line
        const filter = {};
        if (this.sortAttr && this.sortOrder) {
            filter.sort = [
                [this.sortAttr, this.sortOrder],
            ];
        }
        let data;
        try {
            data = this._getData({
                xpath,
                filter,
            });
        } catch (error) {
            console.error(this.id + '._fetchCurrentLabels get failed, err: ' + error.toString());
            this.runCallback(callback, '_fetchCurrentLabels data err cb');
            return;
        }
        this._processTags(callback, data);
    },

    _processTags(callback, objs) {
        this.log('_processTags');

        const refObjs = this._contextObj.get(this._refAttribute);
        const tagArray = [];
        const currentTags = [];

        forEach(objs, tagObj => {
            const value = tagObj.get(this._tagAttribute);
            this._tagCache[ value ] = tagObj;
            forEach(refObjs, ref => {
                if (ref === tagObj.getGuid()) {
                    currentTags.push(tagObj);
                }
            });
            tagArray.push(value);
        });

        this._setOptions(tagArray);
        this._renderCurrentTags(currentTags, callback);
    },

    _renderCurrentTags(currentTags, callback) {
        this.log('_renderCurrentTags', currentTags);

        const items = this._listBox.getElementsByTagName('li');
        while (0 < items.length) {
            //delete the all tags except the 'input' field
            if (!containsClass(items[ 0 ], 'tagit-new')) {
                destroyElement(items[ 0 ]);
            }
            //break if we're at the last item and this item is the input field
            if (1 === items.length && containsClass(items[ 0 ], 'tagit-new')) {
                break;
            }
        }
        const additionalClass = null;
        const duringInitialization = false;
        let value = null;
        let color = null;
        //create a tag for all items
        forEach(currentTags, tagObj => {
            value = tagObj.get(this._tagAttribute);
            color = this._colorAttribute ? tagObj.get(this._colorAttribute) : null;

            $(this._listBox).tagit('createTag', value, additionalClass, duringInitialization, color);
        }, this);

        this.runCallback(callback, '_renderCurrentTags');
    },

    _startTagger(options) {
        this.log('_startTagger');

        const $el = $(this._listBox);

        if (options) {
            $el.tagit(options);
        } else {
            //fallback
            logger.warn('No options found, running defaults');
            $el.tagit();
        }
    },

    _createTagObject(value) {
        this.log('_createTagObject');

        mx.data.create({
            entity: this._tagEntity,
            callback: obj => {
                //set the value
                obj.set(this._tagAttribute, value);
                //save
                mx.data.commit({
                    mxobj: obj,
                    callback: () => {
                        // save the label before calling the microflow to save the new label
                        this._contextObj.addReference(this._refAttribute, obj.getGuid());
                        this._saveObject();
                        //run the after create mf
                        if (this.aftercreatemf) {
                            this._execMf(this.aftercreatemf, this._contextObj.getGuid());
                        } else {
                            console.log(this.id + ' - please add an after create mf to commit the object,' +
                            ' otherwise ui is incorrectly displayed.');
                        }
                    },
                }, this);
            },
            error: e => {
                logger.error('Error creating object: ' + e);
            },
        }, this);
    },

    _resetSubscriptions() {
        this.log('_resetSubscriptions');
        this.unsubscribeAll();

        if (this._contextObj) {
            const guid = this._contextObj.getGuid();
            this.subscribe({
                guid,
                callback: newGuid => {
                    mx.data.get({
                        guid: newGuid,
                        callback: obj => {
                            this._contextObj = obj;
                            this._fetchCurrentLabels();
                        },
                    });
                },
            });
            this.subscribe({
                guid,
                attr: this._refAttribute,
                callback: newGuid => {
                    mx.data.get({
                        guid: newGuid,
                        callback: obj => {
                            this._contextObj = obj;
                            this._fetchCurrentLabels();
                        },
                    });
                },
            });
            this.subscribe({
                guid,
                val: true,
                callback: this._handleValidation.bind(this),
            });
        }
    },

    _isReference(guid) {
        this.log('_isReference');

        let isRef = false;
        const refs = this._contextObj.getReferences(this._refAttribute);

        forEach(refs, ref => {
            if (ref === guid) {
                isRef = true;
            }
        });

        return isRef;
    },

    _saveObject() {
        if (!this.saveOnAddTag) {
            this.log('_saveObject skipped, save on add tags disabled');
            return;
        }
        this.log('_saveObject');
        const method = !mx.version || mx.version && 7 > parseInt(mx.version.split('.')[ 0 ], 10) ? 'save' : 'commit';
        mx.data[ method ]({
            mxobj: this._contextObj,
            callback: () => {
                this._execMf(this.onchangemf, this._contextObj.getGuid());
            },
        }, this);
    },

    _setOptions(tagArray) {
        this.log('_setOptions');

        const options = {
            availableTags: tagArray,
            autocomplete: {
                delay: 0,
                minLength: this.autocompleteMinLength,
            },
            enableCreate: this.enableCreate,
            showAutocompleteOnFocus: this.showAutoCompleteOnFocus,
            removeConfirmation: false,
            caseSensitive: true,
            allowDuplicates: false,
            allowSpaces: false,
            readOnly: this._readOnly,
            tagLimit: 0 < this.tagLimit ? this.tagLimit : null,
            singleField: false,
            singleFieldDelimiter: ',',
            singleFieldNode: null,
            tabIndex: null,
            placeholderText: null,
            afterTagAdded: (_, ui) => {
                this._clearValidations();
                //fetch tag from cache
                const tagObj = this._tagCache[ ui.tagLabel ];

                if (tagObj) {
                    //check if already a reference
                    if (!this._isReference(tagObj.getGuid()) && !this._readOnly) {
                        this._contextObj.addReference(this._refAttribute, tagObj.getGuid());
                        this._saveObject();
                    }
                } else if (this.enableCreate) {
                    this._createTagobject(ui.tagLabel);
                } else {
                    logger.warn('No Tag found for value: ' + ui.tagLabel);
                }
            },
            afterTagRemoved: (_, ui) => {
                this._clearValidations();
                //fetch tag from cache
                const tagObj = this._tagCache[ ui.tagLabel ];
                if (tagObj) {
                    this._contextObj.removeReferences(this._refAttribute, [tagObj.getGuid()]);
                    this._saveObject();
                } else {
                    logger.warn('No Tag found for value: ' + ui.tagLabel);
                }
            },
        };
        this._startTagger(options);
    },

    _handleValidation(validations) {
        this.log('_handleValidation');

        this._clearValidations();

        const val = validations[ 0 ];
        const msg = val.getReasonByAttribute(this._refAttribute);

        if (this.readOnly) {
            val.removeAttribute(this._refAttribute);
        } else if (msg) {
            this._addValidation(msg);
            val.removeAttribute(this._refAttribute);
        }
    },

    _clearValidations() {
        this.log('_clearValidations');
        destroyElement(this._alertdiv);
    },

    _addValidation(innerHTML = '') {
        if ('' === innerHTML) {
            return;
        }
        this.log('_addValidation');

        this._alertdiv = createElement('div', {
            'class': 'alert alert-danger',
            innerHTML,
        });

        this.domNode.appendChild(this._alertdiv);
    },
});
