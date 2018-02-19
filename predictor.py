from typing import List, Tuple
import json

from allennlp.common import Registrable
from allennlp.common.util import JsonDict, sanitize
from allennlp.data import DatasetReader, Instance
from allennlp.models import Model
from allennlp.models.archival import Archive, load_archive
# import tensorflow as tf
# import numpy as np

class Predictor(Registrable):
    """
    a ``Predictor`` is a thin wrapper around an AllenNLP model that handles JSON -> JSON predictions
    that can be used for serving models through the web API or making predictions in bulk.
    """
    def __init__(self, model: Model, dataset_reader: DatasetReader) -> None:
        self._model = model
        self._dataset_reader = dataset_reader

    def load_line(self, line: str) -> JsonDict:  # pylint: disable=no-self-use
        """
        If your inputs are not in JSON-lines format (e.g. you have a CSV)
        you can override this function to parse them correctly.
        """
        return json.loads(line)

    def dump_line(self, outputs: JsonDict) -> str:  # pylint: disable=no-self-use
        """
        If you don't want your outputs in JSON-lines format
        you can override this function to output them differently.
        """
        return json.dumps(outputs) + "\n"

    def predict_json(self, inputs: JsonDict, cuda_device: int = -1) -> JsonDict:
        instance, return_dict = self._json_to_instance(inputs)
        outputs = self._model.forward_on_instance(instance, cuda_device)
        best_span, conf, best_confs, best_starts, best_ends = self.get_best_span(outputs['span_start_logits'], outputs['span_end_logits'],
                                                                                 outputs['span_start_logits'], outputs['span_end_logits'])
        start_logits = outputs['span_start_logits']
        end_logits = outputs['span_end_logits']
        # span, scores = self.best_span_from_bounds(start_logits , end_logits, 10)
        outputs['best_confs'] = best_confs
        outputs['best_starts'] = best_starts
        outputs['best_confs'] = best_confs
        outputs['best_ends'] = best_ends
        outputs['conf'] = conf
        return_dict.update(outputs)
        return sanitize(return_dict)

    # def best_span_from_bounds(self, start_logits, end_logits, bound=None):
    #     """
    #     Brute force approach to finding the best span from start/end logits in tensorflow, still usually
    #     faster then the python dynamic-programming version
    #     """
    #     b = tf.shape(start_logits)[0]
    #
    #     # Using `top_k` to get the index and value at once is faster
    #     # then using argmax and then gather to get in the value
    #     top_k = tf.nn.top_k(start_logits + end_logits, k=1)
    #     values, indices = [tf.squeeze(x) for x in top_k]
    #
    #     # Convert to (start_position, length) format
    #     # indices = tf.stack([indices, tf.fill(b, 0)])
    #
    #     # TODO Might be better to build the batch x n_word x n_word
    #     # matrix and use tf.matrix_band to zero out the unwanted ones...
    #
    #     if bound is None:
    #         n_lengths = tf.shape(start_logits)[1]
    #     else:
    #         # take the min in case the bound > the context
    #         n_lengths = np.minimum(bound, np.shape(start_logits)[0])
    #
    #     def compute(i, values, indices):
    #         top_k = tf.nn.top_k(start_logits[:-i] + end_logits[i:])
    #         b_values, b_indices = [tf.squeeze(x) for x in top_k]
    #
    #         # b_indices = tf.stack([b_indices, tf.fill((b,), i)])
    #         indices = tf.where(b_values > values, b_indices, indices)
    #         values = tf.maximum(values, b_values)
    #         return i + 1, values, indices
    #
    #     _, values, indices = tf.while_loop(
    #         lambda ix, values, indices: ix < n_lengths,
    #         compute,
    #         [1, values, indices],
    #         back_prop=False)
    #
    #     spans = tf.stack([indices[0], indices[0] + indices[1]])
    #     return spans, values


    def get_best_span(self, word_start_probs, word_end_probs, word_start_logits, word_end_logits):
        max_val = -1
        best_word_span = None

        span_start = -1
        span_start_val = -1

        best8_dict = {}

        for word_ix in range(0, len(word_start_probs)):

            # Move `span_start` forward iff that would improve our score
            # Thus span_start will always be the largest valued start between
            # [0, `word_ix`]
            if span_start_val < word_start_probs[word_ix] and word_start_logits[word_ix] > 0:
                span_start_val = word_start_probs[word_ix]
                span_start = word_ix

            # Check if the new span is the best one yet
            if span_start_val * word_end_probs[word_ix] > max_val and word_end_logits[word_ix] > 0:
                best_word_span = (span_start, word_ix)
                max_val = span_start_val * word_end_probs[word_ix]
                best8_dict[max_val] = [span_start, word_ix]

        best8_dict = list(sorted(best8_dict.items(), key=lambda s: s[1]))[:10]

        best_confs = []
        best_starts = []
        best_ends = []
        for item, val in best8_dict:
            best_confs.append(item)
            best_starts.append(val[0])
            best_ends.append(val[1])

        if len(best_confs) == 0 and span_start_val > 0:
            best_confs.append(span_start_val)
            best_starts.append(span_start)
            best_ends.append(span_start)

        return best_word_span, max_val, best_confs, best_starts, best_ends

    def _json_to_instance(self, json_dict: JsonDict) -> Tuple[Instance, JsonDict]:
        """
        Converts a JSON object into an :class:`~allennlp.data.instance.Instance`
        and a ``JsonDict`` of information which the ``Predictor`` should pass through,
        such as tokenised inputs.
        """
        raise NotImplementedError

    def predict_batch_json(self, inputs: List[JsonDict], cuda_device: int = -1) -> List[JsonDict]:
        instances, return_dicts = zip(*self._batch_json_to_instances(inputs))
        outputs = self._model.forward_on_instances(instances, cuda_device)
        for output, return_dict in zip(outputs, return_dicts):
            return_dict.update(output)
        return sanitize(return_dicts)

    def _batch_json_to_instances(self, json_dicts: List[JsonDict]) -> List[Tuple[Instance, JsonDict]]:
        """
        Converts a list of JSON objects into a list of :class:`~allennlp.data.instance.Instance`s.
        By default, this expects that a "batch" consists of a list of JSON blobs which would
        individually be predicted by :func:`predict_json`. In order to use this method for
        batch prediction, :func:`_json_to_instance` should be implemented by the subclass, or
        if the instances have some dependency on each other, this method should be overridden
        directly.
        """
        instances = []
        for json_dict in json_dicts:
            instances.append(self._json_to_instance(json_dict))
        return instances

    @classmethod
    def from_archive(cls, archive: Archive, predictor_name: str) -> 'Predictor':
        """
        Instantiate a :class:`Predictor` from an :class:`~allennlp.models.archival.Archive`;
        that is, from the result of training a model. Optionally specify which `Predictor`
        subclass; otherwise, the default one for the model will be used.
        """
        config = archive.config

        dataset_reader_params = config["dataset_reader"]
        dataset_reader = DatasetReader.from_params(dataset_reader_params)

        model = archive.model
        model.eval()

        return Predictor.by_name(predictor_name)(model, dataset_reader)


class DemoModel:
    """
    A demo model is determined by both an archive file
    (representing the trained model)
    and a choice of predictor
    """
    def __init__(self, archive_file: str, predictor_name: str) -> None:
        self.archive_file = archive_file
        self.predictor_name = predictor_name

    def predictor(self) -> Predictor:
        archive = load_archive(self.archive_file)
        return Predictor.from_archive(archive, self.predictor_name)
